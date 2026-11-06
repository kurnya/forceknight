const https = require("https");
const { createHash } = require("crypto");

/**
 * Pengelola provider AI.
 *
 * Konfigurasi lewat .env (<NAMA> = SAMBANOVA, GROQ, GEMINI, dst.):
 *   AI_PROVIDERS=gemini,sambanova,groq        -> urutan prioritas (opsional)
 *   <NAMA>_API_KEY=key1,key2                  -> satu atau banyak key (pisah koma)
 *   <NAMA>_API_KEY_2=key3, <NAMA>_API_KEY_3=… -> key tambahan bernomor (boleh juga)
 *   <NAMA>_MODEL=model-a,model-b              -> satu atau beberapa model, dicoba berurutan
 *   <NAMA>_URL=https://.../chat/completions   -> untuk provider custom (OpenAI-compatible)
 *   <NAMA>_TIMEOUT_MS=20000                    -> opsional
 *
 * Swap otomatis (pola dari proyek scannering):
 *   - Urutan coba: provider -> model -> key. Key dalam satu model dipakai bergiliran (round-robin).
 *   - Istirahat dihitung per KEY x MODEL (kuota Gemini dihitung per model).
 *   - 429 kuota harian -> istirahat 6 jam; 429 per menit -> ikuti Retry-After / 1 menit (naik bertahap).
 *   - 401/403/key tidak valid -> istirahat 6 jam.  404 / model tidak dikenal -> model dilewati 10 menit.
 *   - Dibatasi jumlah percobaan & total waktu per pesan, supaya Fuuka tidak menggantung lama.
 *
 * Gemini memakai API native (generateContent) + thinkingLevel MINIMAL: model tidak menghabiskan
 * token untuk "berpikir" panjang. Kalau model menolak pengaturan itu, permintaan diulang tanpanya.
 */

const PRESETS = {
  sambanova: { name: "SambaNova", type: "openai", url: "https://api.sambanova.ai/v1/chat/completions", model: "Meta-Llama-3.3-70B-Instruct", timeout: 20000 },
  cerebras: { name: "Cerebras", type: "openai", url: "https://api.cerebras.ai/v1/chat/completions", model: "llama-3.3-70b", timeout: 15000 },
  // Dicek 2026-11-05: llama-3.3-70b-versatile sudah tidak tersedia di Groq; qwen paling cepat & hemat token
  groq: { name: "Groq", type: "openai", url: "https://api.groq.com/openai/v1/chat/completions", model: "qwen/qwen3.8-27b,openai/gpt-oss-120b", timeout: 15000 },
  // Flash-Lite didahulukan karena chat singkat cukup memakai model ringan.
  // Bisa dioverride lewat GEMINI_MODEL jika akun Anda menyediakan model yang lebih baru.
  gemini: { name: "Gemini", type: "gemini", url: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-3.5-flash-lite,gemini-3.8-flash", timeout: 20000 },
  // Preset di bawah tidak punya model default — isi <NAMA>_MODEL sesuai model di akun Anda
  openrouter: { name: "OpenRouter", type: "openai", url: "https://openrouter.ai/api/v1/chat/completions", model: null, timeout: 20000 },
  mistral: { name: "Mistral", type: "openai", url: "https://api.mistral.ai/v1/chat/completions", model: null, timeout: 20000 },
  together: { name: "Together", type: "openai", url: "https://api.together.xyz/v1/chat/completions", model: null, timeout: 20000 }
};

const DEFAULT_ORDER = Object.keys(PRESETS);
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_ATTEMPTS_PER_CALL = 5;        // batas percobaan provider x model x key per pesan
const MAX_CALL_DURATION_MS = 45 * 1000; // berhenti mencoba setelah ini, pakai balasan lokal

const REST = {
  perMinuteMs: 60 * 1000,
  perMinuteMaxMs: 15 * 60 * 1000,
  perDayMs: 6 * 60 * 60 * 1000,
  invalidKeyMs: 6 * 60 * 60 * 1000,
  badModelMs: 10 * 60 * 1000,
  transientMs: 30 * 1000,
  transientMaxMs: 5 * 60 * 1000
};

function splitList(value) {
  return String(value || "").split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
}

function isPlaceholderKey(key) {
  return /^your_.*_here$/i.test(key);
}

// <NAMA>_API_KEY lalu <NAMA>_API_KEY_2, _3, ... (urut nomor), duplikat dibuang
function collectKeys(env, prefix) {
  const pattern = new RegExp(`^${prefix}_API_KEY(?:_(\\d+))?$`);
  const names = Object.keys(env)
    .map((name) => ({ name, match: name.match(pattern) }))
    .filter(({ match }) => match)
    .sort((a, b) => Number(a.match[1] || 1) - Number(b.match[1] || 1));

  const seen = new Set();
  const keys = [];
  for (const { name } of names) {
    for (const key of splitList(env[name])) {
      if (!isPlaceholderKey(key) && !seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  return keys;
}

function loadProviders(env = process.env) {
  const order = splitList(env.AI_PROVIDERS).map((id) => id.toLowerCase());
  const ids = order.length ? order : DEFAULT_ORDER;
  const providers = [];

  for (const id of ids) {
    const prefix = id.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const preset = PRESETS[id] || { type: "openai" };
    const keys = collectKeys(env, prefix);

    if (!keys.length) {
      if (order.length) console.warn(`[AI] Provider "${id}" dilewati: ${prefix}_API_KEY kosong.`);
      continue;
    }

    const url = env[`${prefix}_URL`] || preset.url;
    const models = splitList(env[`${prefix}_MODEL`] || preset.model);

    if (!url || !models.length) {
      console.warn(`[AI] Provider "${id}" dilewati: ${!url ? `${prefix}_URL` : `${prefix}_MODEL`} belum diisi.`);
      continue;
    }

    if (!url.startsWith("https://")) {
      console.warn(`[AI] Provider "${id}" dilewati: ${prefix}_URL harus https://`);
      continue;
    }

    const name = preset.name || id;
    providers.push({
      id,
      name,
      type: preset.type,
      url,
      models,
      timeout: Number(env[`${prefix}_TIMEOUT_MS`]) || preset.timeout || 20000,
      cursor: 0,
      // Pengaturan "berpikir" untuk model reasoning OpenAI-compatible (mis. gpt-oss).
      // Default: "low" untuk model gpt-oss (tanpa ini, balasan bisa KOSONG karena token habis untuk berpikir).
      reasoningEffort: env[`${prefix}_REASONING_EFFORT`] || "",
      noThinking: new Set(), // model yang menolak pengaturan berpikir (thinkingConfig / reasoning_effort)
      // Label & id key tidak memuat isi key — aman untuk log
      keys: keys.map((key, index) => ({
        key,
        label: `${name}#${index + 1}`,
        id: createHash("sha256").update(key).digest("hex").slice(0, 12)
      }))
    });
  }

  return providers;
}

let providers = loadProviders();
const rests = new Map(); // `${providerId}|${keyId}|${model}` -> { until, failures }

function describeProviders() {
  if (!providers.length) return "tidak ada (isi minimal satu <NAMA>_API_KEY di .env)";
  return providers.map((p) => `${p.name} (${p.keys.length} key, ${p.models.join(" / ")})`).join(" → ");
}

console.log(`[AI] Provider aktif: ${describeProviders()}`);

function restKey(provider, slot, model) {
  return `${provider.id}|${slot.id}|${model}`;
}

function isResting(provider, slot, model, now) {
  const rest = rests.get(restKey(provider, slot, model));
  return Boolean(rest && rest.until > now);
}

function rest(provider, slot, model, ms, reason) {
  const key = restKey(provider, slot, model);
  const prev = rests.get(key);
  rests.set(key, { until: Date.now() + ms, failures: (prev?.failures || 0) + 1 });
  console.warn(`[AI] ${slot.label} (${model}) ${reason}, istirahat ${formatDuration(ms)}.`);
}

function previousFailures(provider, slot, model) {
  return rests.get(restKey(provider, slot, model))?.failures || 0;
}

function formatDuration(ms) {
  if (ms >= 60 * 60 * 1000) return `${Math.round(ms / 3600000)} jam`;
  if (ms >= 60 * 1000) return `${Math.round(ms / 60000)} menit`;
  return `${Math.round(ms / 1000)} detik`;
}

/** Key untuk model ini yang sedang tidak istirahat, mulai dari giliran berikutnya (round-robin). */
function takeAvailableKeys(provider, model, now) {
  const total = provider.keys.length;
  const start = provider.cursor % total;
  provider.cursor = (provider.cursor + 1) % total;

  const ordered = [];
  for (let i = 0; i < total; i++) {
    const slot = provider.keys[(start + i) % total];
    if (!isResting(provider, slot, model, now)) ordered.push(slot);
  }
  return ordered;
}

/**
 * Tentukan tindakan setelah gagal.
 * @returns {"next-key"|"next-model"} next-model = model ini bermasalah untuk semua key
 */
function handleFailure(provider, slot, model, result) {
  const { status, error = "" } = result;
  const failures = previousFailures(provider, slot, model);

  if (status === 401 || status === 403 || (status === 400 && /api[_ ]?key/i.test(error))) {
    rest(provider, slot, model, REST.invalidKeyMs, `key ditolak (${status}) — cek key ini di .env`);
    return "next-key";
  }

  if (status === 402) {
    rest(provider, slot, model, REST.invalidKeyMs, "kuota/tagihan akun habis (402) — cek akun provider ini");
    return "next-key";
  }

  if (status === 429) {
    if (/per ?day|daily|harian/i.test(error)) {
      rest(provider, slot, model, REST.perDayMs, "kuota harian habis (429)");
    } else {
      const ms = result.retryAfterMs || Math.min(REST.perMinuteMs * 2 ** failures, REST.perMinuteMaxMs);
      rest(provider, slot, model, ms, "kena limit (429)");
    }
    return "next-key";
  }

  if (status === 404 || (status === 400 && /model/i.test(error))) {
    for (const other of provider.keys) {
      rests.set(restKey(provider, other, model), { until: Date.now() + REST.badModelMs, failures: 0 });
    }
    console.warn(`[AI] ${provider.name} model "${model}" error ${status}, dilewati ${formatDuration(REST.badModelMs)} (cek ${provider.id.toUpperCase()}_MODEL): ${error}`.trim());
    return "next-model";
  }

  const ms = Math.min(REST.transientMs * 2 ** failures, REST.transientMaxMs);
  rest(provider, slot, model, ms, error || `error ${status}`);
  return "next-key";
}

function parseRetryAfter(header) {
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, REST.perMinuteMaxMs) : 0;
}

/** POST JSON, kembalikan { status, json, retryAfterMs } atau { status: 0, error } */
function postJson(url, headers, body, timeout) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    let settled = false;
    const done = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const req = https.request(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), ...headers },
        timeout
      },
      (res) => {
        let data = "";
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            req.destroy();
            done({ status: 0, error: "respons terlalu besar" });
            return;
          }
          data += chunk;
        });
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch (_error) {
            // ditangani pemanggil
          }
          done({ status: res.statusCode || 0, json, retryAfterMs: parseRetryAfter(res.headers?.["retry-after"]) });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      done({ status: 0, error: `timeout ${timeout}ms` });
    });
    req.on("error", (error) => done({ status: 0, error: error.message }));

    req.write(payload);
    req.end();
  });
}

function extractApiError(json) {
  const err = json?.error;
  if (!err) return "";
  if (typeof err === "string") return err;
  // Gemini menaruh jenis kuota (mis. ...PerDay...) di details — ikut dibawa supaya bisa dibedakan
  const details = JSON.stringify(err.details || "").match(/[A-Za-z]*Per(?:Day|Minute)[A-Za-z-]*/)?.[0] || "";
  return `${err.message || err.status || ""} ${details}`.trim();
}

function failureFrom(res) {
  const apiError = extractApiError(res.json);
  return {
    ok: false,
    status: res.status >= 400 ? res.status : (res.status ? 500 : 0),
    retryAfterMs: res.retryAfterMs,
    error: String(res.error || apiError || `HTTP ${res.status}`).slice(0, 200)
  };
}

// ── Adapter OpenAI-compatible ─────────────────────────────────────────────
function getReasoningEffort(provider, model) {
  if (provider.noThinking.has(model)) return "";
  if (provider.reasoningEffort) return provider.reasoningEffort === "off" ? "" : provider.reasoningEffort;
  return /gpt-oss/i.test(model) ? "low" : "";
}

async function requestOpenAI(provider, slot, model, { messages, maxTokens, temperature }) {
  const send = (effort) => postJson(
    provider.url,
    { Authorization: `Bearer ${slot.key}` },
    { model, messages, temperature, max_tokens: maxTokens, ...(effort ? { reasoning_effort: effort } : {}) },
    provider.timeout
  );

  const effort = getReasoningEffort(provider, model);
  let res = await send(effort);
  if (effort && res.status === 400 && /reason/i.test(extractApiError(res.json))) {
    // Model/provider tidak mendukung reasoning_effort: ingat & ulangi tanpa
    provider.noThinking.add(model);
    res = await send("");
  }

  if (res.status !== 200 || !res.json || res.json.error) return failureFrom(res);

  const text = res.json.choices?.[0]?.message?.content?.trim();
  if (!text) return { ok: false, status: 0, error: "respons kosong" };

  const usage = res.json.usage || {};
  return { ok: true, text, usage: { total: usage.total_tokens, prompt: usage.prompt_tokens, output: usage.completion_tokens } };
}

// ── Adapter Gemini native (generateContent) ───────────────────────────────
function toGeminiBody(messages, maxTokens, temperature, withThinking) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

  const generationConfig = { maxOutputTokens: maxTokens, temperature };
  if (withThinking) {
    // Chat singkat tidak butuh penalaran panjang: lebih cepat & token tidak habis untuk "berpikir"
    generationConfig.thinkingConfig = { thinkingLevel: "MINIMAL" };
  }

  return {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents,
    generationConfig
  };
}

function supportsGeminiMinimalThinking(model) {
  // Gemini 3.x menolak thinkingLevel=MINIMAL; biarkan model memakai default-nya.
  return !/^gemini-3\./i.test(model);
}

async function requestGemini(provider, slot, model, { messages, maxTokens, temperature }) {
  const url = `${provider.url}/${encodeURIComponent(model)}:generateContent`;
  // Key lewat header, bukan query string, supaya tidak ikut tercatat di log/URL
  const headers = { "x-goog-api-key": slot.key };

  const send = (withThinking) => postJson(url, headers, toGeminiBody(messages, maxTokens, temperature, withThinking), provider.timeout);

  let res = await send(!provider.noThinking.has(model) && supportsGeminiMinimalThinking(model));
  if (res.status === 400 && !provider.noThinking.has(model) && /think/i.test(extractApiError(res.json))) {
    // Model tidak mendukung pengaturan "berpikir": ingat & ulangi tanpa pengaturan itu
    provider.noThinking.add(model);
    res = await send(false);
  }

  if (res.status !== 200 || !res.json || res.json.error) return failureFrom(res);

  if (res.json.promptFeedback?.blockReason) {
    return { ok: false, status: 0, error: `diblokir filter Gemini (${res.json.promptFeedback.blockReason})`, blocked: true };
  }

  const candidate = res.json.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .filter((part) => typeof part.text === "string" && !part.thought)
    .map((part) => part.text)
    .join("")
    .trim();

  if (!text) {
    const reason = candidate?.finishReason;
    return { ok: false, status: 0, error: `respons kosong${reason && reason !== "STOP" ? ` (${reason})` : ""}`, blocked: reason === "SAFETY" };
  }

  const usage = res.json.usageMetadata || {};
  return { ok: true, text, usage: { total: usage.totalTokenCount, prompt: usage.promptTokenCount, output: usage.candidatesTokenCount } };
}

function requestCompletion(provider, slot, model, options) {
  return provider.type === "gemini"
    ? requestGemini(provider, slot, model, options)
    : requestOpenAI(provider, slot, model, options);
}

/**
 * Kirim chat ke kombinasi provider/model/key pertama yang berhasil.
 * @returns {Promise<string|null>} teks balasan, atau null kalau semua gagal / sedang istirahat
 */
async function chatCompletion(messages, { maxTokens = 150, temperature = 0.7, tag = "chat" } = {}) {
  if (!providers.length) {
    console.warn("[AI] Tidak ada provider AI yang dikonfigurasi.");
    return null;
  }

  const startedAt = Date.now();
  let attempts = 0;

  for (const provider of providers) {
    for (const model of provider.models) {
      for (const slot of takeAvailableKeys(provider, model, Date.now())) {
        if (attempts >= MAX_ATTEMPTS_PER_CALL || Date.now() - startedAt > MAX_CALL_DURATION_MS) {
          console.warn(`[AI] Berhenti setelah ${attempts} percobaan (${Math.round((Date.now() - startedAt) / 1000)} detik), pakai balasan lokal.`);
          return null;
        }
        attempts++;

        const result = await requestCompletion(provider, slot, model, { messages, maxTokens, temperature });

        if (result.ok) {
          rests.delete(restKey(provider, slot, model));
          const u = result.usage;
          console.log(`[AI] ${slot.label} (${model}) ${tag}: ${u.total ?? "?"} token (prompt ${u.prompt ?? "?"}, balasan ${u.output ?? "?"})`);
          return result.text;
        }

        // Pesan ditolak filter keamanan: key/model lain kemungkinan sama saja, jangan buang kuota
        if (result.blocked) {
          console.warn(`[AI] ${slot.label} (${model}) ${result.error}.`);
          return null;
        }

        if (handleFailure(provider, slot, model, result) === "next-model") break;
      }
    }
  }

  console.error("[AI] Semua provider/model/key gagal atau sedang istirahat.");
  return null;
}

/**
 * Cek setiap kombinasi provider x model x key dengan pesan kecil (untuk `npm run cek-ai`).
 * Tidak mengubah status istirahat. Mengembalikan baris hasil tanpa isi key.
 */
async function probeAll() {
  const rows = [];
  for (const provider of providers) {
    for (const model of provider.models) {
      for (const slot of provider.keys) {
        const result = await requestCompletion(provider, slot, model, {
          messages: [{ role: "user", content: "Balas satu kata: OK" }],
          maxTokens: 20,
          temperature: 0
        });
        rows.push({ label: slot.label, model, ok: result.ok, status: result.status, error: result.error || "" });
      }
    }
  }
  return rows;
}

/** Muat ulang konfigurasi dari env tertentu (dipakai test) — status istirahat ikut direset. */
function reloadProviders(env = process.env) {
  providers = loadProviders(env);
  rests.clear();
  return describeProviders();
}

module.exports = {
  chatCompletion,
  describeProviders,
  probeAll,
  reloadProviders,
  PRESETS
};

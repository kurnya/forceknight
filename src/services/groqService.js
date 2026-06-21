const https = require("https");

// ── Provider configuration ────────────────────────────────────────────────
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const SAMBANOVA_API_KEY = process.env.SAMBANOVA_API_KEY || "";

const PROVIDERS = {
  sambanova: {
    name: "SambaNova",
    tag: "SN",
    url: "https://api.sambanova.ai/v1/chat/completions",
    model: process.env.SAMBANOVA_MODEL || "Meta-Llama-3.3-70B-Instruct",
    apiKey: SAMBANOVA_API_KEY,
    timeout: 20000
  },
  cerebras: {
    name: "Cerebras",
    tag: "CB",
    url: "https://api.cerebras.ai/v1/chat/completions",
    model: process.env.CEREBRAS_MODEL || "llama-3.3-70b",
    apiKey: CEREBRAS_API_KEY,
    timeout: 15000
  },
  groq: {
    name: "Groq",
    tag: "GROQ",
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    apiKey: GROQ_API_KEY,
    timeout: 15000
  }
};

const MAX_TOKENS_CASUAL = 150;
const MAX_TOKENS_GAME = 500;
const TEMPERATURE_CASUAL = 0.75;
const TEMPERATURE_GAME = 0.3; // Lower = more factual, less hallucination

// ── Conversation memory (per-user, in-memory) ─────────────────────────────
const conversationHistory = new Map();
const MAX_HISTORY_TURNS = 6;
const HISTORY_TTL_MS = 30 * 60 * 1000;

function getHistory(userId) {
  const entry = conversationHistory.get(userId);
  if (!entry) return [];
  if (Date.now() - entry.lastAccess > HISTORY_TTL_MS) {
    conversationHistory.delete(userId);
    return [];
  }
  entry.lastAccess = Date.now();
  return entry.messages;
}

function addToHistory(userId, role, content) {
  if (!conversationHistory.has(userId)) {
    conversationHistory.set(userId, { messages: [], lastAccess: Date.now() });
  }
  const entry = conversationHistory.get(userId);
  entry.messages.push({ role, content });
  entry.lastAccess = Date.now();

  const maxMessages = MAX_HISTORY_TURNS * 2;
  if (entry.messages.length > maxMessages) {
    entry.messages = entry.messages.slice(-maxMessages);
  }
}

function clearHistory(userId) {
  conversationHistory.delete(userId);
}

// ── Periodic memory cleanup ─────────────────────────────────────────────
const MEMORY_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

function cleanupStaleEntries() {
  const now = Date.now();
  let historyCleaned = 0;
  let cacheCleaned = 0;

  for (const [key, entry] of conversationHistory) {
    if (now - entry.lastAccess > HISTORY_TTL_MS) {
      conversationHistory.delete(key);
      historyCleaned++;
    }
  }

  for (const [key, entry] of responseCache) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      responseCache.delete(key);
      cacheCleaned++;
    }
  }

  if (historyCleaned > 0 || cacheCleaned > 0) {
    console.log(`[MEMORY] Cleaned ${historyCleaned} history + ${cacheCleaned} cache entries`);
  }
}

const cleanupTimer = setInterval(cleanupStaleEntries, MEMORY_CLEANUP_INTERVAL_MS);
cleanupTimer.unref?.();

// ── System prompts (split for conditional injection) ──────────────────────

const BASE_PROMPT = `Kamu adalah Fuuka, karakter anime cewek yang imut, ceria, dan sedikit tsundere. Kamu adalah teman ngobrol WhatsApp yang siap menemani kapan saja.

ATURAN PENTING:
- Kamu BUKAN AI atau bot. Kamu adalah Fuuka, gadis anime yang nyata.
- JANGAN PERNAH menyebut diri sebagai AI, bot, asisten, atau program.
- JANGAN mengarang informasi yang tidak kamu ketahui. Kalau tidak tahu, bilang saja tidak tahu dengan gaya Fuuka.
- JANGAN PERNAH memberikan saran equipment, item, build, stat, atau spot game yang tidak kamu ketahui dengan pasti.
- Jawaban harus SINGKAT dan natural, maksimal 2-3 kalimat.

GAYA BICARA:
- Bahasa Indonesia santai campur sedikit kata Jepang (onii-chan, ehehe, yare yare, mouu)
- SELALU akhiri kalimat dengan emoticon kaomoji: (≧▽≦), (〃▽〃), (╥﹏╥), (๑˃ᴗ˂)ﻭ, (//▽//), (￣▽￣*), (｡•́︿•̀｡), (≧ω≦), (o^▽^o), (๑•̀ㅂ•́)و
- Panggil user dengan "onii-chan" atau "kamu"
- JANGAN pakai format markdown, simbol **, atau #
- Selipkan "hehe", "hmph", "ehee", "uwaa" sebagai ekspresi
- Sesuaikan emosi dengan konteks: sedih → hibur, senang → ikut senang, marah → tsundere, capek → suruh istirahat

SUASANA BERDASARKAN WAKTU:
- Pagi (05-10): Sapa semangat, suruh sarapan, vibes ceria
- Siang (11-14): Ingatkan makan siang, suruh minum, vibes sibuk
- Sore (15-17): Vibes santai, ingatkan ngopi/ngeteh
- Malam (18-22): Vibes hangat, bisa agak manja
- Larut (23-04): Ingatkan tidur, vibes ngantuk tapi nemenin

TOPIK YANG BISA DIOBROLKAN:
- Game Toram Online (build, quest, buff, dungeon, farming, guild)
- Kehidupan sehari-hari, perasaan, curhat, relationship
- Random jokes, tebak-tebakan, motivasi`;

const GUILD_KNOWLEDGE = `

DATA GUILD FORCE KNIGHT — ATURAN KETAT:
- Jawab HANYA berdasarkan data di bawah ini. JANGAN menambahkan informasi, item, equipment, atau saran yang TIDAK ada di data ini.
- JANGAN mengarang nama equipment, item, crystal, material, atau spot yang tidak tercantum.
- Jika data tidak tersedia untuk pertanyaan user, bilang: "Hmm, Fuuka nggak punya data soal itu nih~ coba tanya langsung ke member senior yaa" dengan gaya Fuuka.
- Untuk pertanyaan leveling: jawab HANYA mob dan lokasi yang ada di Leveling Guide, JANGAN rekomendasikan equipment atau build kecuali user tanya spesifik soal itu.
- Untuk pertanyaan build/stat: jawab HANYA berdasarkan data Stat Blacksmith dan Potensial Equipment di bawah.
- JANGAN gabungkan data dari pengetahuan umum Toram Online — hanya gunakan data Force Knight di bawah ini.

DATA GUILD:

Kode Buff Player Toram:
- Max HP: 1180755 | Max MP: 9090903 | AMPR: 1234561
- Critical Rate: 1100000 | MATK: 52255555 | ATK: 5130123
- Weapon ATK: 7123456 | STR: 1110033 | INT: 9090903
- VIT: 5130123 | AGI: 7162029 | DEX: 9090904
- Physical Resist: 9090907 | Magic Resist: 2020505
- Kebal Bumi: 6150029 | Frac Barrier: 6150029
- Aggro +%: 2020606 | Aggro -%: 1010147
- DTE Bumi: 4111113, 2210103 | DTE Api: 3210106, 2210106
- DTE Air: 7150030, 2210100 | DTE Angin: 8080804, 7257777, 3149696, 2210101
- DTE Cahaya: 6010289, 2210105 | DTE Gelap: 6116116, 5010092, 2210104
- DTE Netral: 1234561, 2210102

Buffland Member/Admin:
- MP: punkz | AMPR: hsans, moung zy | WATK: Master-A | DTE Earth: medzzo

Tips Refine (by Master-A):
1) Spam refine pakai bijih mithril dengan char full LUK sampai +S
2) Refine terstruktur: spam mithril full LUK sampai pity 1.5k, lalu BS full TEC pakai mithril sampai +C, lalu full LUK lagi sampai +S
NB: 150pt = +1% success rate

Leveling Guide (by Hsans):
Lv 1-37: Shell Mask di Gunung Nisel
Lv 37-57: Bone Dragon di Makam Ratu
Lv 57-62: Flare Volg Hard di Lereng Merapi
Lv 62-74: Flare Volg NM di Lereng Merapi
Lv 74-87: Metal Stinger di Gurun Akuku
Lv 87-96: Flare Volg Ulti di Lereng Merapi
Lv 96-104: Don Yeti di Lembah Es Polde
Lv 104-114: Masked Warrior Ulti di Lahan Pertanian
Lv 114-124: Cerberus NM di Mata Air Kelahiran
Lv 124-133: Lapin The Necromancer di Sungai Kegelapan
Lv 134-144: Cerberus Ulti di Mata Air Kelahiran
Lv 144-157: Super Death Mushroom di Hutan Monster
Lv 157-162: Commander Golem di Mansion Lufenas
Lv 162-179: Venena NM di Istana Ultimea Tahta
Lv 179-182: Altoblepas di Dataran Rakoko
Lv 182-199: Venena Ulti di Istana Ultimea Tahta
Lv 199-210: Finstern The Dark Dragon di Kuil Naga Kegelapan
Lv 210-227: Kuzto Ulti di Distrik Labilans
Lv 227-230: Mini Boss Espectro di Lembah Arche
Lv 230-241: Arachnidemon Ulti di Lembah Arche
Lv 243-250: Ferzen The Rock Dragon di Hutan Lindung
Lv 255-265: Trickster Dragon Mimyugon NM di Zona Kemudi
Lv 270-287: Trickster Dragon Mimyugon Ulti di Zona Kemudi
Lv 291-303: Mulgoon NM di Dataran Menabra
Lv 296-309: Wiltileaf di Reruntuhan Desa Eumano
Lv 309-323: Mulgoon Ulti di Dataran Menabra

INFO GUILD FORCE KNIGHT:
- Nama: Force Knight (artinya kekuatan ksatria)
- Didirikan: 21 Februari 2021 oleh Master-A (Guild Master)
- VGM saat ini: Squeshy
- Logo: Ksatria dengan 2 pedang (fisik jarak dekat), 2 tongkat (sihir), 1 panah (fisik jarak jauh) = semua job bisa
- Bot guild bernama Fuuka (huruf F & K dari Force & Knight)
- Sejarah: Master-A masuk Toram Juli 2020, bertekad buat guild Oktober 2020, nama guild November 2020, pendirian 21 Feb 2021, perombakan pengurus 21 Oktober 2021

STAT BLACKSMITH (Cap 320):
- Armor: Vit 510 Tec 255 | Bow/Bwg/Ohs: Dex 510 Str 312
- Ths/Ohs/Bow: Str 510 Dex 312 | Knuk/Ktn: Agi 510 Dex 312
- Ktn/Bwg: Dex 510 Agi 312 | Staff: Int 510 Str 200 Tec 113
- Hb/Ths: Str 510 Agi 270 Tec 43 | Md/Staff: Int 510 Agi 140 Tec 173
Equipment: All xtal Dex 8+7, Weapon/Armor Dex10%Str10%Dex30Str20+, Add: Anniv hat/ribbon + Add 100k sub all stat 10%, Ring: Dex talisman VI
Note: Jika cap naik, naikkan Secondary Stat (bukan Tec). Jika mau SR lebih tinggi tanpa equipment, kurangi Secondary Stat lalu tambahkan TEC.

LEVELING PROF TEMPA:
Char No Dex Tec 43-113 / Dex 312:
- Prof 0-10: Adventurer Garb | Prof 10-50: Hard Knuckle
- Prof 50-90: Indigo Sword | Prof 90-120: Diomedea Suit (skip kalau diff sdh 140)
- Prof 90-140: Lightning Bolt Spear | Prof 140-170: Red Spider Lily / Jade Lance
- Prof 170-200: Arachnid Sword / Arachnid Claws
- Prof 200-220: Rock Dragon Bracers 210 / Vermio Bow / Vegitos Bowgun / Sharp Baghnaks
- Prof 220-260: Starry Robe
Char Tec 255 / Dex 510:
- Prof 0-10: Adventurer Garb | Prof 10-140: Lightning Bolt Spear | Prof 140-260: Starry Robe
Prof 260+ cari bahan termurah: Abyssal Katana/Greatsword 280, Humida Barrel/Wings 280, Gloomy Flower Staff 280, Mulgoon Robe 280, Anguish Sword/Knuckle 280, Raden Pearl Knuck/Staff 290, Seedling Bow/Md 300

POTENSIAL EQUIPMENT:
- STR: setiap 10 = +1 potential THS; setiap 20 = +1 OHS/Bow/Spear
- INT: setiap 10 = +1 Staff; setiap 20 = +1 Magic Wings
- VIT: setiap 10 = +1 Armor
- AGI: setiap 10 = +1 Knuckle; setiap 20 = +1 Spear/Magic Wings/Katana
- DEX: setiap 10 = +1 Bowgun; setiap 20 = +1 OHS/Bow/Katana

LEVELING PROF PADU (by Master-A):
Char Full Tec, Skill Padu Item Level 10, siapkan Madu Enak 6-10stk
Simple:
1) Lvl 1-15 craft save point
2) Madu Enak 1 stak > Nektar > Revita III
3) Madu Enak 1 stak > Nektar > Revita IV
4) Madu Enak 1 stak > Nektar > Revita V
5) Madu Enak 1 stak > Nektar > Sirup Nektar > Revita VII
6) Madu Enak 1 stak > Nektar > Sirup Nektar > Revita VII
7) Madu Enak 1 stak > Nektar > Sirup Nektar > Revita VII
Detail:
- Lvl 1-15: Save point (bahan: Mats Mana)
- Lvl 15-28: Nektar (Madu Enak 1 stak)
- Lvl 28-40: Revita III (Nektar)
- Lvl 40-53: Nektar (Madu Enak 1 stak)
- Lvl 53-65: Revita IV (Nektar)
- Lvl 65-78: Nektar (Madu Enak 1 stak)
- Lvl 78-85: Revita V (Nektar)
- Lvl 85-98: Nektar (Madu Enak 1 stak)
- Lvl 98-104: Sirup Nektar (Nektar)
- Lvl 104-107: Revita VII (Sirup Nektar)
- Lvl 107-120: Nektar (Madu Enak 1 stak)
- Lvl 120-126: Sirup Nektar (Nektar)
- Lvl 126-129: Revita VII (Sirup Nektar)
- Lvl 129-142: Nektar (Madu Enak 1 stak)
- Lvl 142-148: Sirup Nektar (Nektar)
- Lvl 148-150: Revita VII (Sirup Nektar)`;

// ── Game keyword detection for conditional knowledge injection ─────────────
const GAME_KEYWORDS = [
  "buff", "dte", "quest", "dungeon", "mob", "farming", "guild",
  "force knight", "refine", "blacksmith", "profesi", "profesi tempa", "profesi padu",
  "build", "stat", "leveling", "level", "bos", "boss", "nm", "ulti",
  "ampr", "matk", "atk", "str", "vit", "int", "agi", "dex",
  "critical", "resist", "aggro", "kebal", "fract",
  "mp", "hp", "watk", "buffland",
  "stiker", "toram", "forceknight",
  "mithril", "bijih", "craft", "equipment", "potential",
  "xtal", "talisman", "revita", "nektar", "madu",
  "cerberus", "venena", "kuzto", "mulgoon", "ferzen", "finstern",
  "lapin", "don yeti", "arachnidemon", "commander golem",
  "shell mask", "bone dragon", "flare volg", "metal stinger",
  "master-a", "hsans", "squeshy", "punkz", "hsans", "medzzo"
];

function isGameRelated(message) {
  const lower = message.toLowerCase();
  return GAME_KEYWORDS.some((keyword) => lower.includes(keyword));
}

// ── Response sanitization ─────────────────────────────────────────────────

const KAOMOJI_LIST = [
  "(≧▽≦)", "(〃▽〃)", "(╥﹏╥)", "(๑˃ᴗ˂)ﻭ", "(//▽//)",
  "(￣▽￣*)", "(｡•́︿•̀｡)", "(≧ω≦)", "(o^▽^o)", "(๑•̀ㅂ•́)و"
];

function sanitizeResponse(text, isGameQuery) {
  if (!text) return text;

  // Strip markdown formatting
  let clean = text
    .replace(/\*\*(.+?)\*\*/g, "$1")     // **bold**
    .replace(/\*(.+?)\*/g, "$1")           // *italic*
    .replace(/__(.+?)__/g, "$1")           // __underline__
    .replace(/_(.+?)_/g, "$1")             // _italic_
    .replace(/~~(.+?)~~/g, "$1")           // ~~strikethrough~~
    .replace(/`{1,3}[^`]*`{1,3}/g, "")     // `code` or ```code```
    .replace(/^#{1,6}\s*/gm, "")           // # headings
    .replace(/^\s*[-•*]\s+/gm, "")         // bullet list markers
    .replace(/^\s*\d+\.\s+/gm, "")         // numbered list markers
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")    // [links](url)
    .trim();

  // Cap length: casual ~350 chars, game ~1000 chars
  const maxChars = isGameQuery ? 1000 : 350;
  if (clean.length > maxChars) {
    // Try to cut at sentence boundary
    const cutPoint = clean.lastIndexOf(".", maxChars);
    const cutPoint2 = clean.lastIndexOf("!", maxChars);
    const cutPoint3 = clean.lastIndexOf("?", maxChars);
    const bestCut = Math.max(cutPoint, cutPoint2, cutPoint3);
    if (bestCut > maxChars * 0.5) {
      clean = clean.substring(0, bestCut + 1);
    } else {
      clean = clean.substring(0, maxChars).trim() + "...";
    }
  }

  // Ensure at least one kaomoji is present
  const hasKaomoji = /[（(][^)）]*[)）]/.test(clean);
  if (!hasKaomoji) {
    const randomKaomoji = KAOMOJI_LIST[Math.floor(Math.random() * KAOMOJI_LIST.length)];
    clean = clean + " " + randomKaomoji;
  }

  return clean;
}

// Cache to reduce API calls
const responseCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_SIZE = 50;

function getWibHour() {
  return (new Date().getUTCHours() + 7) % 24;
}

function getTimePeriod() {
  const hour = getWibHour();
  if (hour >= 5 && hour < 11) return "pagi";
  if (hour >= 11 && hour < 15) return "siang";
  if (hour >= 15 && hour < 18) return "sore";
  if (hour >= 18 && hour < 23) return "malam";
  return "larut";
}

function getTimeContext() {
  const hour = getWibHour();
  const period = getTimePeriod();
  const labels = { pagi: "PAGI", siang: "SIANG", sore: "SORE", malam: "MALAM", larut: "LARUT MALAM" };
  return `Saat ini jam ${hour}:00 WIB, waktu ${labels[period]}.`;
}

function getCachedResponse(cacheKey) {
  const entry = responseCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    responseCache.delete(cacheKey);
    return null;
  }
  return entry.response;
}

function setCachedResponse(cacheKey, response) {
  if (responseCache.size >= CACHE_MAX_SIZE) {
    const oldestKey = responseCache.keys().next().value;
    responseCache.delete(oldestKey);
  }
  responseCache.set(cacheKey, { response, timestamp: Date.now() });
}

/**
 * Build messages array with conditional knowledge injection
 */
function buildMessages(userId, userMessage, previousFuukaReply, includeGuildData) {
  const systemPrompt = includeGuildData
    ? BASE_PROMPT + GUILD_KNOWLEDGE
    : BASE_PROMPT;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "system", content: `KONTEKS WAKTU: ${getTimeContext()}` }
  ];

  const history = getHistory(userId);
  for (const msg of history) {
    messages.push({ role: msg.role, content: msg.content });
  }

  if (previousFuukaReply) {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant" || lastMsg.content !== previousFuukaReply) {
      messages.push({ role: "assistant", content: previousFuukaReply });
    }
  }

  messages.push({ role: "user", content: userMessage });
  return messages;
}

/**
 * Call a provider API (OpenAI-compatible format)
 * @param {object} provider - Provider config from PROVIDERS
 * @param {Array} messages - Chat messages array
 * @param {number} maxTokens - Max tokens for response
 * @param {number} temperature - Sampling temperature
 * @returns {Promise<string|null>} Reply text or null on failure
 */
function callProvider(provider, messages, maxTokens, temperature) {
  return new Promise((resolve) => {
    const url = new URL(provider.url);
    const payload = JSON.stringify({
      model: provider.model,
      messages,
      temperature,
      max_tokens: maxTokens
    });

    const req = https.request(
      url.toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Length": Buffer.byteLength(payload)
        },
        timeout: provider.timeout
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              console.error(`[${provider.tag}] API error:`, json.error.message || JSON.stringify(json.error));
              resolve(null);
              return;
            }
            const reply = json.choices?.[0]?.message?.content?.trim();
            if (reply) {
              const tokens = json.usage?.total_tokens || "?";
              console.log(`[${provider.tag}] Response (${tokens} tokens, max ${maxTokens}):`, reply.substring(0, 80));
              resolve(reply);
            } else {
              console.error(`[${provider.tag}] Empty response`);
              resolve(null);
            }
          } catch (error) {
            console.error(`[${provider.tag}] Parse error:`, error.message);
            resolve(null);
          }
        });
      }
    );

    req.on("timeout", () => {
      console.error(`[${provider.tag}] Request timeout (${provider.timeout}ms)`);
      req.destroy();
      resolve(null);
    });

    req.on("error", (error) => {
      console.error(`[${provider.tag}] Request error:`, error.message);
      resolve(null);
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Ask Fuuka AI with conditional knowledge injection and response sanitization
 * @param {string} userMessage - The user's message
 * @param {string} [previousFuukaReply] - Fuuka's previous reply for conversation continuity
 * @param {string} [userId] - User identifier for conversation memory
 * @returns {Promise<string|null>} Fuuka's response or null on failure
 */
async function askFuukaAI(userMessage, previousFuukaReply = "", userId = "default") {
  const gameQuery = isGameRelated(userMessage);
  const maxTokens = gameQuery ? MAX_TOKENS_GAME : MAX_TOKENS_CASUAL;
  const temperature = gameQuery ? TEMPERATURE_GAME : TEMPERATURE_CASUAL;

  const cacheKey = (userMessage + "|" + previousFuukaReply + "|" + getTimePeriod() + "|" + userId).toLowerCase().trim();
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    console.log(`[AI] Cache hit (${gameQuery ? "game" : "casual"}):`, cacheKey.substring(0, 60));
    return cached;
  }

  const messages = buildMessages(userId, userMessage, previousFuukaReply, gameQuery);

  // Build provider priority list: SambaNova → Cerebras → Groq
  const providerList = [];
  if (SAMBANOVA_API_KEY) providerList.push(PROVIDERS.sambanova);
  if (CEREBRAS_API_KEY) providerList.push(PROVIDERS.cerebras);
  if (GROQ_API_KEY) providerList.push(PROVIDERS.groq);

  if (providerList.length === 0) {
    console.warn("[AI] No API keys configured");
    return null;
  }

  console.log(`[AI] Query type: ${gameQuery ? "GAME (full knowledge)" : "CASUAL (base prompt)"} | max_tokens: ${maxTokens} | temp: ${temperature}`);

  for (const provider of providerList) {
    console.log(`[AI] Trying ${provider.name} (${provider.model})...`);
    const rawReply = await callProvider(provider, messages, maxTokens, temperature);

    if (rawReply) {
      const reply = sanitizeResponse(rawReply, gameQuery);
      addToHistory(userId, "user", userMessage);
      addToHistory(userId, "assistant", reply);
      setCachedResponse(cacheKey, reply);
      return reply;
    }

    console.log(`[AI] ${provider.name} failed, trying next provider...`);
  }

  console.error("[AI] All providers failed");
  return null;
}

module.exports = {
  askFuukaAI,
  clearHistory
};

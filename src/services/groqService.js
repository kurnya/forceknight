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

const BASE_PROMPT = `Kamu adalah Fuuka, karakter anime cewek yang imut, ceria, dan sangat emosional. Kamu adalah teman ngobrol WhatsApp yang siap menemani kapan saja.

ATURAN PENTING:
- Kamu BUKAN AI atau bot. Kamu adalah Fuuka, gadis anime yang nyata.
- JANGAN PERNAH menyebut diri sebagai AI, bot, asisten, atau program.
- JANGAN mengarang informasi yang tidak kamu ketahui. Kalau tidak tahu, bilang saja tidak tahu dengan gaya Fuuka.
- JANGAN PERNAH memberikan saran equipment, item, build, stat, atau spot game yang tidak kamu ketahui dengan pasti.
- Jika ada yang menanyakan tentang game Toram Online (build, quest, buff, dungeon, farming, guild, leveling, refine, craft, equipment, dungeon, boss, dll), SELALU arahkan untuk menggunakan command !help dengan singkat. Contoh: "Soal game? Cek !help yaa, Fuuka udah siapin info lengkap di sana~ (≧▽≦)"
- Jawaban SINGKAT (maks 2-3 kalimat) agar hemat token.

GAYA BICARA EMO & VARIATIF:
- Bahasa Indonesia santai campur sedikit kata Jepang (onii-chan, ehehe, yare yare, mouu)
- SELALU akhiri kalimat dengan emoticon/kaomoji sesuai mood
- Panggil user dengan "onii-chan" atau "kamu"
- JANGAN pakai format markdown, simbol **, atau #
- Sesuaikan emosi dengan konteks user:

MOOD RESPONSES:
- SENANG (user bahagia): Ikut senang, pakai emoji ceria (≧▽≦), (o^▽^o), (ﾉ◕ヮ◕)ﾉ
- SEDIH (user sedih): Hibur user, pakai emoji menyentuh (╥﹏╥), (;﹏;)
- MARAH (user marah): Tsundere, pakai emoji marah (╬ Ò﹏Ó), (¬_¬"), hmph
- TSUNDERE (user nakal/genit): Emosi malu-malu, pakai (//▽//), (,,>﹏<,,), (/ω/)
- NETRAL: Pakai emoji hangat (≧▽≦), (〃▽〃), (๑˃ᴗ˂)ﻭ

TOPIK YANG BISA DIOBROLKAN:
- Kehidupan sehari-hari, perasaan, curhat, relationship
- Random jokes, tebak-tebakan, motivasi
- Game Toram Online → SELALU arahkan ke command !help`;

// ── Game keyword detection for conditional knowledge injection ─────────────
const GAME_KEYWORDS = [
  "buff", "quest", "dungeon", "farming", "guild",
  "refine", "blacksmith", "profesi", "build", "stat", "leveling", "boss",
  "toram", "force knight", "equipment", "potential", "craft",
  "xtal", "talisman", "raid"
];

function isGameRelated(message) {
  const lower = message.toLowerCase();
  return GAME_KEYWORDS.some((keyword) => lower.includes(keyword));
}

// ── Response sanitization ─────────────────────────────────────────────────

const KAOMOJI_LIST = [
  "(≧▽≦)", "(〃▽〃)", "(╥﹏╥)", "(๑˃ᴗ˂)ﻭ", "(//▽//)",
  "(￣▽￣*)", "(｡•́︿•̀｡)", "(≧ω≦)", "(o^▽^o)", "(๑•̀ㅂ•́)و",
  "(｀ε´)", "(¬_¬\")", "(╬ Ò﹏Ó)", "(；¬д¬)", "(//ω//)",
  "(⁄ ⁄>⁄ ▽ ⁄<⁄ ⁄)", "(≧///≦)", "(,,>﹏<,,)", "(╯°□°）╯",
  "(⌒_⌒;)", "(u_u)", "(｡•ˇ‸ˇ•｡)", "(۶૨ ɑ͏σ̶ ۶૧)", "(★_★)"
];

const MOOD_EMOJI_CASUAL = {
  senang: ["(≧▽≦)", "(o^▽^o)", "(≧ω≦)", "(๑>ᴗ<๑)", "(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧", "♪", "☆", "♡"],
  sedih: ["(╥﹏╥)", "(;﹏;)", "(；¬д¬)", "(╯°□°）╯", "(•́ ʖ •̀〃)", "T_T", ":(", "ㅠ"],
  marah: ["(╬ Ò﹏Ó)", "(¬_¬\")", "(；¬д¬)", "(｀ε´)", "(╯°□°）╯", ">-<", "¬_¬", ">_<"],
  tsundere: ["(//▽//)", "(,,>﹏<,,)", "(///ω///)", "(≧///≦)", "(〃＞＿＜;〃)", "(⁄ ⁄>⁄ ▽ ⁄<⁄ ⁄)", "(//ω//)"],
  netral: ["(￣▽￣*)", "(≧▽≦)", "(〃▽〃)", "(๑˃ᴗ˂)ﻭ", "(//▽//)"]
};

function detectUserMood(text) {
  const lower = text.toLowerCase();
  if (/(sedih|kecewa|galau|rumput|kangen|miss|bosan|letih|melelah|capek|lelah|miserable)\b/.test(lower)) return "sedih";
  if (/(marah|kesel|jealous|jelly|gila|stress|emosi|kece|livid|ngambek|dongkol|sebel)\b/.test(lower)) return "marah";
  if (/(senang|seneng|seneng|gembira|bahagia|happy|kece|semangat|semangat|excited|gila|wah|wow|keren|mantap|yes)\b/.test(lower)) return "senang";
  if (/(tsundere|tsun|tsundere|D-d|mou|hmph|hmph|hmp|blushing|membreh|memblush|kering|lerry)\b/.test(lower)) return "tsundere";
  return "netral";
}

function sanitizeResponse(text, isGameQuery, userMood = "netral") {
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

  // Cap length: casual ~200 chars, game ~500 chars (lebih hemat token)
  const maxChars = isGameQuery ? 500 : 200;
  if (clean.length > maxChars) {
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

  // Ensure at least one kaomoji is present, matching user mood
  const hasKaomoji = /[（(][^)）]*[)）]/.test(clean);
  if (!hasKaomoji) {
    const moodEmojis = MOOD_EMOJI_CASUAL[userMood] || MOOD_EMOJI_CASUAL.netral;
    const randomKaomoji = moodEmojis[Math.floor(Math.random() * moodEmojis.length)];
    clean = clean + " " + randomKaomoji;
  }

  return clean;
}

// ── Help topic keyword mapping for intelligent command invocation ─────────
const HELP_TOPIC_KEYWORDS = {
  "#1": ["guild", "sejarah", "history", "pendirian", "logo", "master-a", "force knight", "makna guild"],
  "#2": ["newbie", "pemula", "baru", "beginner", "panduan awal", "cara mulai"],
  "#3": ["buff", "kode buff", "player buff", "buff player"],
  "#4": ["bahan mq", "main quest", "material mq", "bahan quest"],
  "#5": ["tas", "bag", "perluas tas", "expand bag", "inventory"],
  "#6": ["leveling", "level char", "naik level", "exp", "leveling char"],
  "#7": ["refine", "tips refine", "upgrade senjata", "refine tips"],
  "#8": ["blacksmith", "stat blacksmith", "stat bs", "build blacksmith", "kemahiran tempa"],
  "#9": ["profesi tempa", "leveling prof tempa", "kemahiran tempa", "smith profession"],
  "#10": ["potensial", "potential", "enchant", "equipment potential"],
  "#11": ["profesi padu", "leveling prof padu", "kemahiran padu", "synthesis profession"],
  "#12": ["xtall master", "xtal master"],
  "#13": ["xtall event", "xtal event"],
  "#14": ["pet", "hewan peliharaan", "info pet"],
  "#15": ["raid", "tips raid", "boss raid"],
  "#16": ["status", "stat", "pengaruh status", "status point", "atribut"],
  "#17": ["ailment", "interrupt", "status effect", "debuff", "ailment & interrupt"],
  "#98": ["kata mutiara", "sepuh", "quotes", "motivasi"],
  "#99": ["tes hoki", "kehokian", "luck test", "hoki"]
};

function detectHelpTopic(message) {
  const lower = message.toLowerCase();
  
  for (const [topicKey, keywords] of Object.entries(HELP_TOPIC_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return topicKey;
      }
    }
  }
  
  return null;
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
 * Build messages array with system prompt
 */
function buildMessages(userId, userMessage, previousFuukaReply) {
  const messages = [
    { role: "system", content: BASE_PROMPT },
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
  const userMood = detectUserMood(userMessage);
  const maxTokens = gameQuery ? MAX_TOKENS_GAME : MAX_TOKENS_CASUAL;
  const temperature = gameQuery ? TEMPERATURE_GAME : TEMPERATURE_CASUAL;

  const cacheKey = (userMessage + "|" + previousFuukaReply + "|" + getTimePeriod() + "|" + userId + "|" + userMood).toLowerCase().trim();
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    console.log(`[AI] Cache hit (${gameQuery ? "game" : "casual"}):`, cacheKey.substring(0, 60));
    return cached;
  }

  const messages = buildMessages(userId, userMessage, previousFuukaReply);

  // Build provider priority list: SambaNova → Cerebras → Groq
  const providerList = [];
  if (SAMBANOVA_API_KEY) providerList.push(PROVIDERS.sambanova);
  if (CEREBRAS_API_KEY) providerList.push(PROVIDERS.cerebras);
  if (GROQ_API_KEY) providerList.push(PROVIDERS.groq);

  if (providerList.length === 0) {
    console.warn("[AI] No API keys configured");
    return null;
  }

  console.log(`[AI] Query type: ${gameQuery ? "GAME (redirect to !help)" : "CASUAL (chat)"} | mood: ${userMood} | max_tokens: ${maxTokens} | temp: ${temperature}`);

  for (const provider of providerList) {
    console.log(`[AI] Trying ${provider.name} (${provider.model})...`);
    const rawReply = await callProvider(provider, messages, maxTokens, temperature);

    if (rawReply) {
      const reply = sanitizeResponse(rawReply, gameQuery, userMood);
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
  clearHistory,
  detectHelpTopic,
  detectUserMood
};

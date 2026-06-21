const dotenv = require("dotenv");

dotenv.config();

function parseGroupCommandRules(value) {
  if (!value) {
    return new Map();
  }

  const rules = new Map();
  const entries = value.split(";").map((entry) => entry.trim()).filter(Boolean);

  for (const entry of entries) {
    const [groupId, commandList] = entry.split("=");

    if (!groupId || !commandList) {
      continue;
    }

    const commands = commandList
      .split(",")
      .map((command) => command.trim().toLowerCase())
      .filter(Boolean);

    rules.set(groupId.trim(), new Set(commands));
  }

  return rules;
}

function parseEnabledCommands(value) {
  return (value || "fuuka,stiker,gambar,audio,intro")
    .split(",")
    .map((command) => command.trim().toLowerCase())
    .filter(Boolean);
}

function parsePositiveNumber(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

const settings = {
  botName: process.env.BOT_NAME || "Fuuka",
  botNumber: process.env.BOT_NUMBER || "",
  port: Number(process.env.PORT) || 3000,
  prefix: process.env.PREFIX || "!",
  allowedGroups: process.env.ALLOWED_GROUPS || "",
  enabledCommands: parseEnabledCommands(process.env.ENABLED_COMMANDS),
  groupCommandRules: parseGroupCommandRules(process.env.GROUP_COMMAND_RULES),
  whatsappKeepAliveMs: parsePositiveNumber(process.env.WHATSAPP_KEEP_ALIVE_MS, 10000),
  whatsappConnectTimeoutMs: parsePositiveNumber(process.env.WHATSAPP_CONNECT_TIMEOUT_MS, 60000),
  whatsappDefaultQueryTimeoutMs: parsePositiveNumber(process.env.WHATSAPP_DEFAULT_QUERY_TIMEOUT_MS, 60000),
  tempCleanupEnabled: parseBoolean(process.env.TEMP_CLEANUP_ENABLED, true),
  tempCleanupIntervalMs: parsePositiveNumber(process.env.TEMP_CLEANUP_INTERVAL_MS, 24 * 60 * 60 * 1000),
  tempCleanupMaxAgeMs: parsePositiveNumber(process.env.TEMP_CLEANUP_MAX_AGE_MS, 2 * 60 * 60 * 1000),
  tempCleanupStartupDelayMs: parsePositiveNumber(process.env.TEMP_CLEANUP_STARTUP_DELAY_MS, 60 * 1000),
  youtubeCookiesJson: process.env.YOUTUBE_COOKIES_JSON || "",
  youtubeCookiesPath: process.env.YOUTUBE_COOKIES_PATH || "",
  audioMaxSeconds: parsePositiveNumber(process.env.AUDIO_MAX_SECONDS, 10 * 60),
  audioMaxDownloadSize: process.env.AUDIO_MAX_DOWNLOAD_SIZE || "15M",
  audioBitrate: process.env.AUDIO_BITRATE || "96K",
  mediaMaxConcurrent: Math.floor(parsePositiveNumber(process.env.MEDIA_MAX_CONCURRENT, 1)),
  mediaQueueLimit: Math.floor(parsePositiveNumber(process.env.MEDIA_QUEUE_LIMIT, 5)),
  ffmpegTimeoutMs: parsePositiveNumber(process.env.FFMPEG_TIMEOUT_MS, 120000),
  sharpConcurrency: Math.floor(parsePositiveNumber(process.env.SHARP_CONCURRENCY, 1))
};

module.exports = settings;

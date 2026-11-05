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
  return (value || "fuuka,stiker,gambar,intro")
    .split(",")
    .map((command) => command.trim().toLowerCase())
    .filter(Boolean);
}

function parsePositiveNumber(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : fallback;
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
  mediaMaxConcurrent: Math.floor(parsePositiveNumber(process.env.MEDIA_MAX_CONCURRENT, 1)),
  mediaQueueLimit: Math.floor(parsePositiveNumber(process.env.MEDIA_QUEUE_LIMIT, 5)),
  // Batas ukuran media yang boleh diunduh ke RAM (default 15 MB)
  mediaMaxBytes: Math.floor(parsePositiveNumber(process.env.MEDIA_MAX_BYTES, 15 * 1024 * 1024)),
  // Jeda minimal antar command media (stiker/gambar) per pengirim
  mediaUserCooldownMs: parsePositiveNumber(process.env.MEDIA_USER_COOLDOWN_MS, 10000),
  sharpConcurrency: Math.floor(parsePositiveNumber(process.env.SHARP_CONCURRENCY, 1))
};

module.exports = settings;

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
  return (value || "fuuka,stiker")
    .split(",")
    .map((command) => command.trim().toLowerCase())
    .filter(Boolean);
}

const settings = {
  botName: process.env.BOT_NAME || "Fuuka",
  botNumber: process.env.BOT_NUMBER || "",
  port: Number(process.env.PORT) || 3000,
  prefix: process.env.PREFIX || "!",
  allowedGroups: process.env.ALLOWED_GROUPS || "",
  enabledCommands: parseEnabledCommands(process.env.ENABLED_COMMANDS),
  groupCommandRules: parseGroupCommandRules(process.env.GROUP_COMMAND_RULES)
};

module.exports = settings;

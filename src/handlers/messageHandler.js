const settings = require("../config/settings");
const { isAllowedGroup } = require("../utils/groupValidator");
const { extractMessageText, getMentionedJids } = require("../utils/messageParser");
const stiker = require("../commands/stiker");
const audio = require("../commands/audio");
const fuuka = require("../commands/fuuka");
const help = require("../commands/help");
const intro = require("../commands/intro");
const menu = require("../commands/menu");

const registeredCommands = [stiker, audio, fuuka, help, intro, menu];
const commands = new Map(registeredCommands.map((command) => [command.name, command]));

for (const command of registeredCommands) {
  for (const alias of command.aliases || []) {
    commands.set(alias, command);
  }
}

async function handleMessage(sock, message) {
  try {
    if (!message || message.key?.fromMe) {
      return;
    }

    const remoteJid = message.key?.remoteJid;
    const isGroupMessage = typeof remoteJid === "string" && remoteJid.endsWith("@g.us");

    if (!isGroupMessage) {
      return;
    }

    console.log("Group:", remoteJid);
    console.log("[MESSAGE] Pesan masuk dari grup:", remoteJid);

    if (!isAllowedGroup(remoteJid)) {
      console.log("[GROUP BLOCKED] Grup tidak diizinkan:", remoteJid);
      return;
    }

    const messageText = extractMessageText(message).trim();

    if (!messageText) {
      return;
    }

    const hasPrefix = messageText.startsWith(settings.prefix);
    const normalizedMessageText = messageText.toLowerCase();
    const plainCommandName = normalizedMessageText.split(/\s+/)[0];
    const isFuukaWithoutPrefix = fuuka.shouldTriggerWithoutPrefix(normalizedMessageText);
    const isFuukaWithHashPrefix = plainCommandName === `#${fuuka.name}`;
    const isIntroWithoutPrefix = plainCommandName === intro.name;
    const isHelpWithoutPrefix = normalizedMessageText === help.name;
    const isMenuWithoutPrefix = normalizedMessageText === menu.name;
    const helpTopicKey = help.normalizeTopicKey(messageText.split(/\s+/)[0]);
    const isHelpTopicCode = Boolean(help.topicReplies[helpTopicKey]);
    const mentionedJids = getMentionedJids(message);
    const commandText = hasPrefix
      ? messageText.slice(settings.prefix.length).trim()
      : isFuukaWithHashPrefix
        ? messageText.slice(1).trim()
        : isFuukaWithoutPrefix
          ? fuuka.name
          : isIntroWithoutPrefix && mentionedJids.length
            ? messageText.trim()
            : (isHelpWithoutPrefix || isHelpTopicCode)
              ? `${help.name} ${messageText}`.trim()
              : isMenuWithoutPrefix
                ? menu.name
                : "";

    if (!commandText) {
      return;
    }

    const [commandName, ...args] = commandText.split(/\s+/);
    const normalizedCommandName = commandName.toLowerCase();
    const command = commands.get(normalizedCommandName);
    const canonicalCommandName = command?.name || normalizedCommandName;
    const globallyEnabledCommands = new Set(settings.enabledCommands);

    const alwaysAllowedCommands = new Set([help.name, menu.name]);

    if (!alwaysAllowedCommands.has(canonicalCommandName) && !globallyEnabledCommands.has(canonicalCommandName)) {
      console.log(`[COMMAND DISABLED] Command ${canonicalCommandName} sedang dinonaktifkan secara global.`);
      return;
    }

    const allowedCommandsForGroup = settings.groupCommandRules.get(remoteJid);

    if (allowedCommandsForGroup && !alwaysAllowedCommands.has(canonicalCommandName) && !allowedCommandsForGroup.has(canonicalCommandName)) {
      console.log(`[COMMAND BLOCKED] Command ${canonicalCommandName} tidak diizinkan di grup ${remoteJid}`);
      return;
    }

    if (!command) {
      return;
    }

    await command.execute({
      sock,
      message,
      prefix: settings.prefix,
      args,
      mentionedJids,
      rawText: messageText
    });
  } catch (error) {
    console.error("[MESSAGE ERROR] Gagal memproses pesan:", error);
  }
}

module.exports = {
  handleMessage
};

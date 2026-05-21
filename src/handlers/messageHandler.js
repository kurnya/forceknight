const settings = require("../config/settings");
const { isAllowedGroup } = require("../utils/groupValidator");
const { extractMessageText, getMentionedJids } = require("../utils/messageParser");
const stiker = require("../commands/stiker");
const fuuka = require("../commands/fuuka");
const help = require("../commands/help");
const intro = require("../commands/intro");

const commands = new Map([
  [stiker.name, stiker],
  [fuuka.name, fuuka],
  [help.name, help],
  [intro.name, intro]
]);

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
              : "";

    if (!commandText) {
      return;
    }

    const [commandName, ...args] = commandText.split(/\s+/);
    const normalizedCommandName = commandName.toLowerCase();
    const globallyEnabledCommands = new Set(settings.enabledCommands);

    if (normalizedCommandName !== help.name && !globallyEnabledCommands.has(normalizedCommandName)) {
      console.log(`[COMMAND DISABLED] Command ${normalizedCommandName} sedang dinonaktifkan secara global.`);
      return;
    }

    const allowedCommandsForGroup = settings.groupCommandRules.get(remoteJid);

    if (allowedCommandsForGroup && !allowedCommandsForGroup.has(normalizedCommandName)) {
      console.log(`[COMMAND BLOCKED] Command ${normalizedCommandName} tidak diizinkan di grup ${remoteJid}`);
      return;
    }

    const command = commands.get(normalizedCommandName);

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

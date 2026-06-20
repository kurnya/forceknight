const settings = require("../config/settings");
const { isAllowedGroup } = require("../utils/groupValidator");
const { extractMessageText, getMentionedJids, getQuotedMessageContext } = require("../utils/messageParser");
const stiker = require("../commands/stiker");
const gambar = require("../commands/gambar");
const gif = require("../commands/gif");
const video = require("../commands/video");
const audio = require("../commands/audio");
const fuuka = require("../commands/fuuka");
const help = require("../commands/help");
const intro = require("../commands/intro");
const menu = require("../commands/menu");

const registeredCommands = [stiker, gambar, gif, video, audio, fuuka, help, intro, menu];
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
    const mentionedJids = getMentionedJids(message);
    const botJid = sock.user?.id || "";
    const botLid = sock.user?.lid || "";
    // Extract just the number part (before : or @) for comparison
    const botJidNum = botJid.split(/[:@]/)[0];
    const botLidNum = botLid.split(/[:@]/)[0];
    const isBotMentioned = mentionedJids.length > 0 && mentionedJids.some((jid) => {
      const jidNum = jid.split(/[:@]/)[0];
      return jidNum === botJidNum || jidNum === botLidNum;
    });

    // Check if replying to a Fuuka message
    const quotedCtx = getQuotedMessageContext(message);
    const quotedParticipant = quotedCtx?.participant || "";
    const quotedPartNum = quotedParticipant.split(/[:@]/)[0];
    const isReplyToBot = quotedParticipant && (quotedPartNum === botJidNum || quotedPartNum === botLidNum);
    // Get quoted message text for conversation context
    let quotedText = "";
    if (isReplyToBot && quotedCtx?.quotedMessage) {
      const qMsg = quotedCtx.quotedMessage;
      quotedText = (qMsg.conversation || qMsg.extendedTextMessage?.text || "").trim();
    }

    if (mentionedJids.length > 0) {
      console.log("[DEBUG] mentionedJids:", mentionedJids);
      console.log("[DEBUG] botJidNum:", botJidNum, "| botLidNum:", botLidNum);
      console.log("[DEBUG] isBotMentioned:", isBotMentioned);
    }
    if (isReplyToBot) {
      console.log("[DEBUG] Reply to bot detected | quotedText:", quotedText.substring(0, 80));
    }

    const isFuukaWithoutPrefix = fuuka.shouldTriggerWithoutPrefix(normalizedMessageText) || isBotMentioned || isReplyToBot;
    const isFuukaWithHashPrefix = plainCommandName === `#${fuuka.name}`;
    const isIntroWithoutPrefix = plainCommandName === intro.name;
    const isHelpWithoutPrefix = normalizedMessageText === help.name;
    const isMenuWithoutPrefix = normalizedMessageText === menu.name;
    const helpTopicKey = help.normalizeTopicKey(messageText.split(/\s+/)[0]);
    const isHelpTopicCode = Boolean(help.topicReplies[helpTopicKey]);
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
      rawText: messageText,
      isBotMentioned,
      isReplyToBot,
      quotedText
    });
  } catch (error) {
    console.error("[MESSAGE ERROR] Gagal memproses pesan:", error);
  }
}

module.exports = {
  handleMessage
};

const settings = require("../config/settings");
const { isAllowedGroup } = require("../utils/groupValidator");
const { extractMessageText, getMentionedJids, getQuotedMessageContext } = require("../utils/messageParser");
const stiker = require("../commands/stiker");
const gambar = require("../commands/gambar");
const audio = require("../commands/audio");
const fuuka = require("../commands/fuuka");
const help = require("../commands/help");
const intro = require("../commands/intro");
const menu = require("../commands/menu");

const registeredCommands = [stiker, gambar, audio, fuuka, help, intro, menu];
const commands = new Map(registeredCommands.map((command) => [command.name, command]));

for (const command of registeredCommands) {
  for (const alias of command.aliases || []) {
    commands.set(alias, command);
  }
}

// Cache untuk menyimpan LID bot yang ditemukan dari pesan grup
let cachedBotLid = null;

function normalizeJidUser(value) {
  return String(value || "")
    .split(/[:@]/)[0]
    .replace(/\D/g, "");
}

function getBotIdentityNumbers(sock) {
  return new Set(
    [
      normalizeJidUser(sock?.user?.id),
      normalizeJidUser(sock?.user?.lid),
      normalizeJidUser(cachedBotLid),
      normalizeJidUser(settings.botNumber)
    ].filter(Boolean)
  );
}

// Kumpulkan raw JID bot (termasuk format LID) untuk matching mention
function getBotRawJids(sock) {
  const rawJids = new Set();
  if (sock?.user?.id) rawJids.add(sock.user.id.split(":")[0] + "@s.whatsapp.net");
  if (sock?.user?.id) rawJids.add(sock.user.id); // full JID dengan device suffix
  if (sock?.user?.lid) rawJids.add(sock.user.lid); // LID dari sock (kalau ada)
  if (cachedBotLid) rawJids.add(cachedBotLid); // LID yang sudah dicache
  return rawJids;
}

/**
 * Coba ekstrak dan cache LID bot dari berbagai sumber:
 * 1. Creds saat koneksi open (state.creds.me.lid)
 * 2. Participant pesan fromMe — paling akurat, langsung dari pesan bot sendiri
 */
function tryCaptureBotLid(sock, message) {
  if (cachedBotLid) return; // sudah punya cache, skip

  const participant = message.key?.participant;
  if (!participant) return;

  // Sumber 1 & 2: participant harus berformat @lid
  if (message.key?.fromMe && participant.endsWith("@lid")) {
    cachedBotLid = participant;
    const src = message._fromCreds ? "creds" : "participant fromMe";
    console.log(`[BOT LID] LID bot berhasil dicache dari ${src}:`, cachedBotLid);
  }
}

function isOwnMessage(sock, message) {
  if (!message || message.key?.fromMe) {
    return true;
  }

  const botIdentityNumbers = getBotIdentityNumbers(sock);
  if (!botIdentityNumbers.size) {
    return false;
  }

  const remoteJid = message.key?.remoteJid || "";
  const isGroupMessage = typeof remoteJid === "string" && remoteJid.endsWith("@g.us");
  const senderJid = isGroupMessage ? message.key?.participant : remoteJid;
  const senderNumber = normalizeJidUser(senderJid);

  return Boolean(senderNumber && botIdentityNumbers.has(senderNumber));
}

function isReplyingToBot(sock, message) {
  const botIdentityNumbers = getBotIdentityNumbers(sock);
  if (!botIdentityNumbers.size) {
    return false;
  }

  const quotedParticipant = getQuotedMessageContext(message)?.participant;
  const quotedParticipantNumber = normalizeJidUser(quotedParticipant);

  return Boolean(quotedParticipantNumber && botIdentityNumbers.has(quotedParticipantNumber));
}

async function handleMessage(sock, message) {
  try {
    // Coba cache LID bot dari setiap pesan (termasuk fromMe) sebelum difilter
    tryCaptureBotLid(sock, message);

    if (isOwnMessage(sock, message)) {
      return;
    }

    const remoteJid = message.key?.remoteJid;
    const isGroupMessage = typeof remoteJid === "string" && remoteJid.endsWith("@g.us");

    if (!isGroupMessage) {
      return;
    }

    console.log("[MESSAGE] Pesan masuk dari grup:", remoteJid);

    if (!isAllowedGroup(remoteJid)) {
      console.log("[GROUP BLOCKED] Grup tidak diizinkan:", remoteJid);
      return;
    }

    if (isReplyingToBot(sock, message)) {
      console.log("[REPLY IGNORED] Pesan reply ke Fuuka diabaikan:", remoteJid);
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
    const botIdentityNumbers = getBotIdentityNumbers(sock);
    const botRawJids = getBotRawJids(sock);
    const isBotMentioned = mentionedJids.length > 0 && mentionedJids.some((jid) => {
      // Cek via normalized number (format normal: 628xxx@s.whatsapp.net)
      const jidNum = normalizeJidUser(jid);
      if (jidNum && botIdentityNumbers.has(jidNum)) return true;
      // Cek via raw JID (format LID: 12345:0@lid)
      if (botRawJids.has(jid)) return true;
      // Cek partial: bagian sebelum ':' atau '@' sama dengan LID bot (dari cache atau sock)
      const jidBase = jid.split(/[:@]/)[0];
      const lidSources = [sock?.user?.lid, cachedBotLid].filter(Boolean);
      for (const lid of lidSources) {
        const lidBase = String(lid).split(/[:@]/)[0];
        if (jidBase && lidBase && jidBase === lidBase) return true;
      }
      return false;
    });
    const isReplyToBot = false;
    const quotedText = "";
    if (mentionedJids.length > 0) {
      console.log("[DEBUG] mentionedJids:", mentionedJids);
      console.log("[DEBUG] sock.user.id:", sock?.user?.id);
      console.log("[DEBUG] sock.user.lid:", sock?.user?.lid);
      console.log("[DEBUG] cachedBotLid:", cachedBotLid);
      console.log("[DEBUG] settings.botNumber:", settings.botNumber);
      console.log("[DEBUG] botIdentityNumbers:", [...botIdentityNumbers]);
      console.log("[DEBUG] botRawJids:", [...botRawJids]);
      console.log("[DEBUG] isBotMentioned:", isBotMentioned);
    }
    const isFuukaWithoutPrefix = fuuka.shouldTriggerWithoutPrefix(normalizedMessageText) || isBotMentioned;
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
  handleMessage,
  isOwnMessage,
  isReplyingToBot,
  normalizeJidUser,
  tryCaptureBotLid
};

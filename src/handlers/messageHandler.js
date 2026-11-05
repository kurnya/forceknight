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

// Dibuat sekali saat load — bukan di setiap pesan
const globallyEnabledCommands = new Set(settings.enabledCommands);
const alwaysAllowedCommands = new Set([help.name, menu.name]);

// Cache LID bot — diisi dari berbagai sumber, manapun yang lebih dulu tersedia
let cachedBotLid = null;

function normalizeJidUser(value) {
  return String(value || "")
    .split(/[:@]/)[0]
    .replace(/\D/g, "");
}

/**
 * Set cachedBotLid dari luar (dipanggil dari index.js saat creds.update atau connection open).
 * Sumber yang valid: creds.me.lid, sock.user.lid, atau participant @lid dari pesan fromMe.
 */
function setBotLid(lid) {
  if (!lid || cachedBotLid) return;
  // Validasi: harus berformat angka@lid atau angka:0@lid
  const normalized = String(lid).trim();
  if (!normalized.includes("@lid")) return;

  cachedBotLid = normalized;
  console.log(`[BOT LID] LID bot tersimpan: ${cachedBotLid}`);
}

/**
 * Reset cachedBotLid — dipanggil dari index.js saat session baru (auth ulang).
 */
function resetBotLid() {
  if (cachedBotLid) {
    console.log(`[BOT LID] Reset LID cache (auth ulang).`);
  }
  cachedBotLid = null;
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
  if (sock?.user?.id) rawJids.add(sock.user.id);
  if (sock?.user?.lid) rawJids.add(sock.user.lid);
  if (cachedBotLid) rawJids.add(cachedBotLid);
  return rawJids;
}

/**
 * Coba tangkap LID dari pesan masuk sebagai fallback terakhir.
 * Dipanggil untuk setiap pesan — kalau cachedBotLid sudah terisi, langsung skip.
 */
function tryCaptureBotLid(sock, message) {
  if (cachedBotLid) return;

  // Fallback: tangkap dari participant pesan fromMe di grup (format @lid)
  const participant = message.key?.participant;
  if (message.key?.fromMe && participant?.endsWith("@lid")) {
    setBotLid(participant);
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

    // Tidak log setiap pesan grup — di grup ramai ini membebani I/O.
    // Log cukup saat command benar-benar dijalankan (lihat [COMMAND] di bawah).
    if (!isAllowedGroup(remoteJid)) {
      return;
    }

    if (isReplyingToBot(sock, message)) {
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
    // Identitas bot dihitung sekali per pesan, lalu dipakai ulang di semua pengecekan
    const botIdentityNumbers = getBotIdentityNumbers(sock);
    const botRawJids = getBotRawJids(sock);
    const botLidBases = [sock?.user?.lid, cachedBotLid]
      .filter(Boolean)
      .map((lid) => String(lid).split(/[:@]/)[0]);

    const isBotJid = (jid) => {
      // Cek via normalized number — format normal: 628xxx@s.whatsapp.net
      const jidNum = normalizeJidUser(jid);
      if (jidNum && botIdentityNumbers.has(jidNum)) return true;
      // Cek via raw JID — termasuk format LID penuh: 12345:0@lid
      if (botRawJids.has(jid)) return true;
      // Cek partial LID — bandingkan bagian angka saja sebelum ':' atau '@'
      const jidBase = String(jid).split(/[:@]/)[0];
      return Boolean(jidBase) && botLidBases.includes(jidBase);
    };

    const isBotMentioned = mentionedJids.some(isBotJid);

    const isReplyToBot = false;
    const quotedText = "";

    const isFuukaWithoutPrefix = fuuka.shouldTriggerWithoutPrefix(normalizedMessageText) || isBotMentioned;
    const isFuukaWithHashPrefix = plainCommandName === `#${fuuka.name}`;

    // ── Deteksi reply ke member (bukan Fuuka) + ketik "intro" ──
    const quotedContext = getQuotedMessageContext(message);
    const quotedParticipant = quotedContext?.participant || null;
    const isReplyToMember = Boolean(
      quotedParticipant &&
      !botIdentityNumbers.has(normalizeJidUser(quotedParticipant)) &&
      !botRawJids.has(quotedParticipant)
    );
    const messageWords = normalizedMessageText.split(/\s+/);
    const messageHasIntroKeyword = messageWords.includes(intro.name);
    // Trigger intro via reply: reply pesan member + teks "intro" (posisi bebas)
    const isIntroViaReply = isReplyToMember && messageHasIntroKeyword;

    // Intro trigger — berbagai pola yang didukung:
    // 1. "intro @member"         — kata pertama adalah "intro", ada mention non-bot
    // 2. "@member intro"         — ada kata "intro" di mana saja, ada mention non-bot
    // 3. "@member"               — hanya mention (tanpa kata apapun), ada mention non-bot
    // 4. Reply pesan member + ketik "intro" (posisi bebas)
    const hasNonBotMention = mentionedJids.some((jid) => !isBotJid(jid));
    const isIntroTrigger = !hasPrefix && !isBotMentioned && (
      isIntroViaReply ||
      (hasNonBotMention && messageHasIntroKeyword)
    );

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
          : isIntroTrigger
            ? `${intro.name} ${messageText}`.trim()
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

    console.log(`[COMMAND] ${canonicalCommandName} | grup ${remoteJid}`);

    await command.execute({
      sock,
      message,
      prefix: settings.prefix,
      args,
      mentionedJids,
      rawText: messageText,
      isBotMentioned,
      isReplyToBot,
      quotedText,
      quotedParticipant  // JID pengirim pesan yang di-reply (untuk intro via reply)
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
  tryCaptureBotLid,
  setBotLid,
  resetBotLid
};

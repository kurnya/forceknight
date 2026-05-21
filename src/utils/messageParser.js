function unwrapMessageContent(messageContent) {
  if (!messageContent) {
    return null;
  }

  return (
    messageContent.ephemeralMessage?.message ||
    messageContent.viewOnceMessageV2?.message ||
    messageContent.viewOnceMessage?.message ||
    messageContent
  );
}

function isViewOnceMessageContent(messageContent) {
  return Boolean(
    messageContent?.viewOnceMessage ||
    messageContent?.viewOnceMessageV2 ||
    messageContent?.viewOnceMessageV2Extension
  );
}

function extractMessageText(message) {
  const messageContent = unwrapMessageContent(message?.message);

  if (!messageContent) {
    return "";
  }

  return (
    messageContent.conversation ||
    messageContent.extendedTextMessage?.text ||
    messageContent.imageMessage?.caption ||
    messageContent.videoMessage?.caption ||
    messageContent.documentMessage?.caption ||
    ""
  );
}

function getQuotedMessageContext(message) {
  const messageContent = unwrapMessageContent(message?.message);

  if (!messageContent) {
    return null;
  }

  return (
    messageContent.extendedTextMessage?.contextInfo ||
    messageContent.imageMessage?.contextInfo ||
    messageContent.videoMessage?.contextInfo ||
    messageContent.documentMessage?.contextInfo ||
    null
  );
}

function createQuotedMessage(message) {
  const contextInfo = getQuotedMessageContext(message);
  const quotedMessage = unwrapMessageContent(contextInfo?.quotedMessage);

  if (!contextInfo || !quotedMessage) {
    return null;
  }

  return {
    key: {
      remoteJid: message.key?.remoteJid,
      id: contextInfo.stanzaId,
      participant: contextInfo.participant
    },
    message: quotedMessage
  };
}

function extractTextFromMessageContent(messageContent) {
  if (!messageContent) {
    return "";
  }

  return (
    messageContent.conversation ||
    messageContent.extendedTextMessage?.text ||
    messageContent.imageMessage?.caption ||
    messageContent.videoMessage?.caption ||
    messageContent.documentMessage?.caption ||
    ""
  );
}

function getMediaSourceMessage(message) {
  const isDirectViewOnce = isViewOnceMessageContent(message?.message);
  const directMessage = unwrapMessageContent(message?.message);

  if (directMessage?.imageMessage) {
    return {
      source: "direct",
      message,
      isViewOnce: isDirectViewOnce || Boolean(directMessage.imageMessage.viewOnce)
    };
  }

  const contextInfo = getQuotedMessageContext(message);
  const isQuotedViewOnce = isViewOnceMessageContent(contextInfo?.quotedMessage);
  const quotedMessage = createQuotedMessage(message);

  if (quotedMessage?.message?.imageMessage) {
    return {
      source: "quoted",
      message: quotedMessage,
      isViewOnce: isQuotedViewOnce || Boolean(quotedMessage.message.imageMessage.viewOnce)
    };
  }

  return null;
}

function getQuotedText(message) {
  const quotedMessage = createQuotedMessage(message);

  if (!quotedMessage) {
    return "";
  }

  return extractTextFromMessageContent(quotedMessage.message).trim();
}

function getMentionedJids(message) {
  const messageContent = unwrapMessageContent(message?.message);

  if (!messageContent) {
    return [];
  }

  const contextInfo =
    messageContent.extendedTextMessage?.contextInfo ||
    messageContent.imageMessage?.contextInfo ||
    messageContent.videoMessage?.contextInfo ||
    messageContent.documentMessage?.contextInfo;

  return contextInfo?.mentionedJid || [];
}

module.exports = {
  extractMessageText,
  getMediaSourceMessage,
  getQuotedText,
  getMentionedJids
};

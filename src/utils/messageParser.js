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
      type: "image",
      message,
      isViewOnce: isDirectViewOnce || Boolean(directMessage.imageMessage.viewOnce)
    };
  }

  if (directMessage?.documentMessage?.mimetype?.startsWith("image/")) {
    return {
      source: "direct",
      type: "image",
      message,
      isViewOnce: isDirectViewOnce
    };
  }

  if (directMessage?.videoMessage) {
    return {
      source: "direct",
      type: "video",
      message,
      isViewOnce: isDirectViewOnce || Boolean(directMessage.videoMessage.viewOnce),
      seconds: directMessage.videoMessage.seconds || 0
    };
  }

  const contextInfo = getQuotedMessageContext(message);
  const isQuotedViewOnce = isViewOnceMessageContent(contextInfo?.quotedMessage);
  const quotedMessage = createQuotedMessage(message);

  if (quotedMessage?.message?.imageMessage) {
    return {
      source: "quoted",
      type: "image",
      message: quotedMessage,
      isViewOnce: isQuotedViewOnce || Boolean(quotedMessage.message.imageMessage.viewOnce)
    };
  }

  if (quotedMessage?.message?.documentMessage?.mimetype?.startsWith("image/")) {
    return {
      source: "quoted",
      type: "image",
      message: quotedMessage,
      isViewOnce: isQuotedViewOnce
    };
  }

  if (quotedMessage?.message?.videoMessage) {
    return {
      source: "quoted",
      type: "video",
      message: quotedMessage,
      isViewOnce: isQuotedViewOnce || Boolean(quotedMessage.message.videoMessage.viewOnce),
      seconds: quotedMessage.message.videoMessage.seconds || 0
    };
  }

  return null;
}

function getStickerSourceMessage(message) {
  const directMessage = unwrapMessageContent(message?.message);

  if (directMessage?.stickerMessage) {
    return {
      source: "direct",
      message,
      isAnimated: Boolean(directMessage.stickerMessage.isAnimated)
    };
  }

  const quotedMessage = createQuotedMessage(message);

  if (quotedMessage?.message?.stickerMessage) {
    return {
      source: "quoted",
      message: quotedMessage,
      isAnimated: Boolean(quotedMessage.message.stickerMessage.isAnimated)
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
  getStickerSourceMessage,
  getQuotedText,
  getMentionedJids,
  getQuotedMessageContext
};

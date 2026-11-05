// Hanya format raster umum yang diterima dari dokumen. SVG/HEIC/TIFF ditolak
// (SVG diproses librsvg — permukaan serangan terbesar di sharp).
const ALLOWED_IMAGE_DOCUMENT_MIMETYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function isAllowedImageDocument(documentMessage) {
  const mimetype = String(documentMessage?.mimetype || "").split(";")[0].trim().toLowerCase();
  return ALLOWED_IMAGE_DOCUMENT_MIMETYPES.has(mimetype);
}

function getFileLength(mediaMessage) {
  return Number(mediaMessage?.fileLength || 0);
}

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
      fileLength: getFileLength(directMessage.imageMessage),
      isViewOnce: isDirectViewOnce || Boolean(directMessage.imageMessage.viewOnce)
    };
  }

  if (isAllowedImageDocument(directMessage?.documentMessage)) {
    return {
      source: "direct",
      type: "image",
      message,
      fileLength: getFileLength(directMessage.documentMessage),
      isViewOnce: isDirectViewOnce
    };
  }

  if (directMessage?.videoMessage) {
    return {
      source: "direct",
      type: "video",
      message,
      fileLength: getFileLength(directMessage.videoMessage),
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
      fileLength: getFileLength(quotedMessage.message.imageMessage),
      isViewOnce: isQuotedViewOnce || Boolean(quotedMessage.message.imageMessage.viewOnce)
    };
  }

  if (isAllowedImageDocument(quotedMessage?.message?.documentMessage)) {
    return {
      source: "quoted",
      type: "image",
      message: quotedMessage,
      fileLength: getFileLength(quotedMessage.message.documentMessage),
      isViewOnce: isQuotedViewOnce
    };
  }

  if (quotedMessage?.message?.videoMessage) {
    return {
      source: "quoted",
      type: "video",
      message: quotedMessage,
      fileLength: getFileLength(quotedMessage.message.videoMessage),
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
      fileLength: getFileLength(directMessage.stickerMessage),
      isAnimated: Boolean(directMessage.stickerMessage.isAnimated)
    };
  }

  const quotedMessage = createQuotedMessage(message);

  if (quotedMessage?.message?.stickerMessage) {
    return {
      source: "quoted",
      message: quotedMessage,
      fileLength: getFileLength(quotedMessage.message.stickerMessage),
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

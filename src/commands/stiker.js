const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const P = require("pino");
const sharp = require("sharp");

const { getMediaSourceMessage } = require("../utils/messageParser");

async function convertImageToSticker(imageBuffer) {
  return sharp(imageBuffer)
    .resize(512, 512, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .webp({ quality: 80 })
    .toBuffer();
}

module.exports = {
  name: "stiker",
  description: "Mengubah gambar menjadi stiker WhatsApp.",
  execute: async ({ sock, message }) => {
    const mediaSource = getMediaSourceMessage(message);

    if (!mediaSource) {
      await sock.sendMessage(message.key.remoteJid, {
        text: "Reply gambar dengan !stiker, atau kirim gambar dengan caption !stiker."
      });
      return;
    }

    let imageBuffer;
    let stickerBuffer;

    try {
      // Media diproses langsung di memory, tidak disimpan ke file lokal.
      imageBuffer = await downloadMediaMessage(
        mediaSource.message,
        "buffer",
        {},
        {
          logger: P({ level: "silent" }),
          reuploadRequest: sock.updateMediaMessage
        }
      );

      stickerBuffer = await convertImageToSticker(imageBuffer);

      await sock.sendMessage(
        message.key.remoteJid,
        {
          sticker: stickerBuffer
        },
        {
          quoted: message
        }
      );
    } finally {
      imageBuffer = null;
      stickerBuffer = null;
    }
  }
};

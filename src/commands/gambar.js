const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const P = require("pino");
const sharp = require("sharp");

const { getStickerSourceMessage } = require("../utils/messageParser");

async function convertStaticStickerToImage(stickerBuffer) {
  return sharp(stickerBuffer)
    .png()
    .toBuffer();
}

async function convertAnimatedStickerToImage(stickerBuffer) {
  return sharp(stickerBuffer, {
    animated: true,
    page: 0,
    pages: 1
  })
    .png()
    .toBuffer();
}

module.exports = {
  name: "gambar",
  aliases: ["toimg", "image", "unsticker"],
  description: "Mengubah stiker WhatsApp menjadi gambar PNG.",
  execute: async ({ sock, message, prefix }) => {
    const stickerSource = getStickerSourceMessage(message);

    if (!stickerSource) {
      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: `Reply stiker dengan ${prefix}gambar untuk mengubahnya jadi gambar PNG.`
        },
        {
          quoted: message
        }
      );
      return;
    }

    let stickerBuffer;
    let imageBuffer;

    try {
      stickerBuffer = await downloadMediaMessage(
        stickerSource.message,
        "buffer",
        {},
        {
          logger: P({ level: "silent" }),
          reuploadRequest: sock.updateMediaMessage
        }
      );

      imageBuffer = stickerSource.isAnimated
        ? await convertAnimatedStickerToImage(stickerBuffer)
        : await convertStaticStickerToImage(stickerBuffer);

      await sock.sendMessage(
        message.key.remoteJid,
        {
          image: imageBuffer,
          mimetype: "image/png",
          caption: stickerSource.isAnimated
            ? "Ini frame pertama dari stiker animasinya yaa~"
            : undefined
        },
        {
          quoted: message
        }
      );
    } catch (error) {
      console.error("[GAMBAR ERROR] Gagal mengubah stiker menjadi gambar:", error);

      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: "Maaf yaa, Fuuka belum bisa ubah stiker ini jadi gambar. Coba kirim stiker lain atau stiker statis dulu."
        },
        {
          quoted: message
        }
      );
    } finally {
      stickerBuffer = null;
      imageBuffer = null;
    }
  }
};

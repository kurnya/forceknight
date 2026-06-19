const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const P = require("pino");
const sharp = require("sharp");

const { getStickerSourceMessage } = require("../utils/messageParser");
const { runMediaJob } = require("../utils/mediaQueue");

async function convertAnimatedStickerToGif(stickerBuffer) {
  return sharp(stickerBuffer, {
    animated: true
  })
    .gif({
      loop: 0
    })
    .toBuffer();
}

module.exports = {
  name: "gif",
  aliases: ["togif", "stickergif"],
  description: "Mengubah stiker animasi WhatsApp menjadi GIF.",
  execute: async ({ sock, message, prefix }) => {
    const stickerSource = getStickerSourceMessage(message);

    if (!stickerSource) {
      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: `Reply stiker bergerak dengan ${prefix}gif untuk mengubahnya jadi GIF.`
        },
        {
          quoted: message
        }
      );
      return;
    }

    if (!stickerSource.isAnimated) {
      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: `Stiker ini tidak bergerak. Pakai ${prefix}gambar untuk mengubahnya jadi PNG yaa.`
        },
        {
          quoted: message
        }
      );
      return;
    }

    try {
      const gifBuffer = await runMediaJob(async () => {
        const stickerBuffer = await downloadMediaMessage(
          stickerSource.message,
          "buffer",
          {},
          {
            logger: P({ level: "silent" }),
            reuploadRequest: sock.updateMediaMessage
          }
        );

        return convertAnimatedStickerToGif(stickerBuffer);
      });

      await sock.sendMessage(
        message.key.remoteJid,
        {
          document: gifBuffer,
          mimetype: "image/gif",
          fileName: "sticker.gif"
        },
        {
          quoted: message
        }
      );
    } catch (error) {
      if (error.code === "MEDIA_QUEUE_FULL") {
        await sock.sendMessage(
          message.key.remoteJid,
          {
            text: "Antrian GIF sedang penuh. Coba lagi sebentar yaa~ (｡•́︿•̀｡)"
          },
          { quoted: message }
        );
        return;
      }

      console.error("[GIF ERROR]", error);

      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: "Maaf yaa, Fuuka belum bisa ubah stiker ini jadi GIF. Coba stiker animasi lain dulu."
        },
        { quoted: message }
      );
    }
  }
};

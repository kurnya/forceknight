const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const P = require("pino");
const sharp = require("sharp");

const { getStickerSourceMessage } = require("../utils/messageParser");
const { runMediaJob } = require("../utils/mediaQueue");

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

    try {
      const imageBuffer = await runMediaJob(async () => {
        const stickerBuffer = await downloadMediaMessage(
          stickerSource.message,
          "buffer",
          {},
          {
            logger: P({ level: "silent" }),
            reuploadRequest: sock.updateMediaMessage
          }
        );

        return stickerSource.isAnimated
          ? await convertAnimatedStickerToImage(stickerBuffer)
          : await convertStaticStickerToImage(stickerBuffer);
      });

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
      if (error.code === "MEDIA_QUEUE_FULL") {
        await sock.sendMessage(
          message.key.remoteJid,
          {
            text: "Antrian gambar sedang penuh. Coba lagi sebentar yaa~ (｡•́︿•̀｡)"
          },
          { quoted: message }
        );
        return;
      }

      console.error("[GAMBAR ERROR]", error);

      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: "Maaf yaa, Fuuka belum bisa ubah stiker ini jadi gambar. Coba kirim stiker lain atau stiker statis dulu."
        },
        { quoted: message }
      );
    }
  }
};

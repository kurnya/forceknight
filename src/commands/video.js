const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const crypto = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const P = require("pino");
const sharp = require("sharp");

const { getStickerSourceMessage } = require("../utils/messageParser");

ffmpeg.setFfmpegPath(ffmpegPath);

async function convertAnimatedStickerToGif(stickerBuffer) {
  return sharp(stickerBuffer, {
    animated: true
  })
    .gif({
      loop: 0
    })
    .toBuffer();
}

async function convertGifToMp4(gifBuffer) {
  const tempId = crypto.randomUUID();
  const inputPath = path.join(os.tmpdir(), `sticker-video-${tempId}.gif`);
  const outputPath = path.join(os.tmpdir(), `sticker-video-${tempId}.mp4`);

  await fs.writeFile(inputPath, gifBuffer);

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          "-movflags +faststart",
          "-pix_fmt yuv420p",
          "-vf scale=trunc(iw/2)*2:trunc(ih/2)*2"
        ])
        .format("mp4")
        .save(outputPath)
        .on("end", resolve)
        .on("error", reject);
    });

    return fs.readFile(outputPath);
  } finally {
    await Promise.allSettled([
      fs.unlink(inputPath),
      fs.unlink(outputPath)
    ]);
  }
}

module.exports = {
  name: "video",
  aliases: ["tomp4", "stickervideo"],
  description: "Mengubah stiker animasi WhatsApp menjadi video MP4.",
  execute: async ({ sock, message, prefix }) => {
    const stickerSource = getStickerSourceMessage(message);

    if (!stickerSource) {
      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: `Reply stiker bergerak dengan ${prefix}video untuk mengubahnya jadi MP4.`
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

    let stickerBuffer;
    let gifBuffer;
    let videoBuffer;

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

      gifBuffer = await convertAnimatedStickerToGif(stickerBuffer);
      videoBuffer = await convertGifToMp4(gifBuffer);

      await sock.sendMessage(
        message.key.remoteJid,
        {
          video: videoBuffer,
          mimetype: "video/mp4"
        },
        {
          quoted: message
        }
      );
    } catch (error) {
      console.error("[VIDEO ERROR] Gagal mengubah stiker menjadi video:", error);

      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: "Maaf yaa, Fuuka belum bisa ubah stiker ini jadi video. Coba pakai !gif atau stiker animasi lain dulu."
        },
        {
          quoted: message
        }
      );
    } finally {
      stickerBuffer = null;
      gifBuffer = null;
      videoBuffer = null;
    }
  }
};

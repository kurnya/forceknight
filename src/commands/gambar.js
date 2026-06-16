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

async function convertStaticStickerToImage(stickerBuffer) {
  return sharp(stickerBuffer)
    .png()
    .toBuffer();
}

async function convertAnimatedStickerToImage(stickerBuffer) {
  const tempId = crypto.randomUUID();
  const inputPath = path.join(os.tmpdir(), `sticker-image-${tempId}.webp`);
  const outputPath = path.join(os.tmpdir(), `sticker-image-${tempId}.png`);

  await fs.writeFile(inputPath, stickerBuffer);

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          "-frames:v 1"
        ])
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
    } finally {
      stickerBuffer = null;
      imageBuffer = null;
    }
  }
};

const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const crypto = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const P = require("pino");
const sharp = require("sharp");

const { getMediaSourceMessage } = require("../utils/messageParser");

const MAX_ANIMATED_STICKER_SECONDS = 6;

ffmpeg.setFfmpegPath(ffmpegPath);

async function convertImageToSticker(imageBuffer) {
  return sharp(imageBuffer)
    .resize(512, 512, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .webp({ quality: 80 })
    .toBuffer();
}

async function convertVideoToSticker(videoBuffer) {
  const tempId = crypto.randomUUID();
  const inputPath = path.join(os.tmpdir(), `stiker-${tempId}.mp4`);
  const outputPath = path.join(os.tmpdir(), `stiker-${tempId}.webp`);

  await fs.writeFile(inputPath, videoBuffer);

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          "-t 6",
          "-vf scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=0x00000000",
          "-loop 0",
          "-an",
          "-vsync 0",
          "-quality 75",
          "-compression_level 6"
        ])
        .format("webp")
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
  name: "stiker",
  description: "Mengubah gambar atau video pendek menjadi stiker WhatsApp.",
  execute: async ({ sock, message }) => {
    const mediaSource = getMediaSourceMessage(message);

    if (!mediaSource) {
      await sock.sendMessage(message.key.remoteJid, {
        text: "Reply gambar/video pendek dengan !stiker, atau kirim media dengan caption !stiker."
      });
      return;
    }

    if (mediaSource.isViewOnce) {
      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: "Maaf, media sekali lihat tidak bisa dibuat stiker demi menjaga privasi member."
        },
        {
          quoted: message
        }
      );
      return;
    }

    if (mediaSource.type === "video" && mediaSource.seconds > MAX_ANIMATED_STICKER_SECONDS) {
      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: `Video terlalu panjang. Maksimal ${MAX_ANIMATED_STICKER_SECONDS} detik untuk stiker bergerak.`
        },
        {
          quoted: message
        }
      );
      return;
    }

    let mediaBuffer;
    let stickerBuffer;

    try {
      // Media diproses langsung di memory, tidak disimpan ke file lokal.
      mediaBuffer = await downloadMediaMessage(
        mediaSource.message,
        "buffer",
        {},
        {
          logger: P({ level: "silent" }),
          reuploadRequest: sock.updateMediaMessage
        }
      );

      stickerBuffer = mediaSource.type === "video"
        ? await convertVideoToSticker(mediaBuffer)
        : await convertImageToSticker(mediaBuffer);

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
      mediaBuffer = null;
      stickerBuffer = null;
    }
  }
};

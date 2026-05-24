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
const viewOncePrivacyReplies = [
  "E-ehh, Fuuka nggak boleh bikin stiker dari media sekali lihat yaa... itu rahasia member, harus dijaga baik-baik~ (｡•́︿•̀｡)",
  "Uwaa, ini media sekali lihat lho~ Fuuka tutup mata dulu yaa, privasi member nomor satu! (つ﹏⊂)",
  "Maaf yaa onii-chan, Fuuka nggak bisa ubah media sekali lihat jadi stiker. Nanti rahasianya kebuka dong~ (´；ω；`)",
  "Fuuka tahu itu lucu, tapi kalau sekali lihat berarti harus dihormati yaa~ jadi stiker-nya Fuuka batalin dulu (｡•̀ᴗ-)✧",
  "Ehehe... Fuuka nggak akan nakal ambil media sekali lihat. Privasi member harus Fuuka lindungi~ (｀・ω・´)",
  "Stop dulu yaa~ media sekali lihat bukan bahan stiker. Fuuka jagain aman-aman biar nggak tersebar (〃ω〃)",
  "Aduh, Fuuka pengen bantu, tapi ini sekali lihat. Jadi nggak bisa dibuat stiker demi kenyamanan member yaa~ (´ . .̫ . `)",
  "No no no~ kalau media sekali lihat, Fuuka harus jadi anak baik dan nggak bikin stiker dari situ (≧◡≦)",
  "Fuuka simpan sopan santun dulu yaa: media sekali lihat tetap sekali lihat, bukan untuk dijadikan stiker~ (๑˃ᴗ˂)ﻭ",
  "Rahasia member terdeteksi! Fuuka nggak akan proses media sekali lihat jadi stiker. Aman bersama Fuuka~ (o^▽^o)"
];

ffmpeg.setFfmpegPath(ffmpegPath);

function pickRandomReply(replies) {
  return replies[Math.floor(Math.random() * replies.length)];
}

async function convertImageToSticker(imageBuffer) {
  const metadata = await sharp(imageBuffer).metadata();
  const webpOptions = metadata.hasAlpha
    ? { lossless: true, quality: 100, alphaQuality: 100 }
    : { quality: 80 };

  return sharp(imageBuffer)
    .ensureAlpha()
    .resize(512, 512, {
      fit: "contain",
      position: "center",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .webp(webpOptions)
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
          "-vf scale=512:512:force_original_aspect_ratio=increase,crop=512:512,fps=10",
          "-loop 0",
          "-an",
          "-vsync 0",
          "-quality 65",
          "-compression_level 4"
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
  aliases: ["sticker"],
  description: "Mengubah gambar atau video pendek menjadi stiker WhatsApp.",
  execute: async ({ sock, message }) => {
    const mediaSource = getMediaSourceMessage(message);

    if (!mediaSource) {
      await sock.sendMessage(message.key.remoteJid, {
        text: "Reply gambar/video pendek dengan !stiker, atau kirim media dengan caption !stiker. Untuk PNG transparan, kirim sebagai dokumen agar latarnya tetap transparan."
      });
      return;
    }

    if (mediaSource.isViewOnce) {
      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: pickRandomReply(viewOncePrivacyReplies)
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

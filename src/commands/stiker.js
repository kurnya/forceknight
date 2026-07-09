const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const crypto = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const P = require("pino");
const sharp = require("sharp");

const settings = require("../config/settings");
const { getMediaSourceMessage } = require("../utils/messageParser");
const { runMediaJob } = require("../utils/mediaQueue");

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
      let timedOut = false;
      let ffmpegProc = null;

      const timeoutId = setTimeout(() => {
        timedOut = true;
        try { ffmpegProc?.kill("SIGKILL"); } catch (_e) { /* ignore */ }
        reject(new Error("FFmpeg timeout"));
      }, settings.ffmpegTimeoutMs);

      ffmpegProc = ffmpeg(inputPath)
        .outputOptions([
          "-t 6",
          "-threads 1",
          "-vcodec libwebp_anim",
          "-vf scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,fps=15",
          "-loop 0",
          "-an",
          "-q:v 70",
          "-compression_level 4",
          "-preset default"
        ])
        .format("webp")
        .save(outputPath)
        .on("end", () => {
          clearTimeout(timeoutId);
          if (!timedOut) resolve();
        })
        .on("error", (error) => {
          clearTimeout(timeoutId);
          if (!timedOut) reject(error);
        });
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

    let processingSent = false;

    try {
      const stickerBuffer = await runMediaJob(async () => {
        const mediaBuffer = await downloadMediaMessage(
          mediaSource.message,
          "buffer",
          {},
          {
            logger: P({ level: "silent" }),
            reuploadRequest: sock.updateMediaMessage
          }
        );

        if (mediaSource.type === "video") {
          if (mediaSource.seconds > MAX_ANIMATED_STICKER_SECONDS) {
            await sock.sendMessage(
              message.key.remoteJid,
              {
                text: `Video terlalu panjang (${mediaSource.seconds}s). Maksimal ${MAX_ANIMATED_STICKER_SECONDS} detik untuk stiker animasi.`
              },
              { quoted: message }
            );
            return null;
          }

          await sock.sendMessage(
            message.key.remoteJid,
            { text: "Sedang proses stiker video... tunggu sebentar yaa~ (๑˃ᴗ˂)ﻭ" },
            { quoted: message }
          );
          processingSent = true;
        }

        return mediaSource.type === "video"
          ? await convertVideoToSticker(mediaBuffer)
          : await convertImageToSticker(mediaBuffer);
      });

      if (!stickerBuffer) {
        return;
      }

      await sock.sendMessage(
        message.key.remoteJid,
        {
          sticker: stickerBuffer
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
            text: "Antrian stiker sedang penuh. Coba lagi sebentar yaa~ (｡•́︿•̀｡)"
          },
          { quoted: message }
        );
        return;
      }

      console.error("[STIKER ERROR]", error);

      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: error.message === "FFmpeg timeout"
            ? "Proses stiker videonya terlalu lama. Coba video yang lebih pendek yaa~ (｡•́︿•̀｡)"
            : "Maaf yaa, Fuuka belum bisa bikin stiker dari media ini. Coba media lain dulu~ (´；ω；`)"
        },
        { quoted: message }
      );
    }
  }
};

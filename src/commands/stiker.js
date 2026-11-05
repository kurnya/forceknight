const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const P = require("pino");
const sharp = require("sharp");

const settings = require("../config/settings");
const { getMediaSourceMessage } = require("../utils/messageParser");
const { runMediaJob, takeUserMediaSlot } = require("../utils/mediaQueue");

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

module.exports = {
  name: "stiker",
  aliases: ["sticker"],
  description: "Mengubah gambar menjadi stiker WhatsApp.",
  execute: async ({ sock, message }) => {
    const mediaSource = getMediaSourceMessage(message);

    if (!mediaSource) {
      await sock.sendMessage(message.key.remoteJid, {
        text: "Reply gambar dengan !stiker, atau kirim gambar dengan caption !stiker. Untuk PNG transparan, kirim sebagai dokumen agar latarnya tetap transparan."
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

    // Stiker video dimatikan — konversi video terlalu berat untuk server
    if (mediaSource.type === "video") {
      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: "Maaf yaa, stiker dari video/GIF lagi dimatikan biar server Fuuka nggak kepanasan~ Kirim gambar aja yaa (｡•́︿•̀｡)"
        },
        { quoted: message }
      );
      return;
    }

    // Validasi ukuran dari metadata pesan — sebelum download & sebelum ambil slot antrean
    if (mediaSource.fileLength > settings.mediaMaxBytes) {
      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: `Ukuran medianya terlalu besar (${(mediaSource.fileLength / 1048576).toFixed(1)} MB). Maksimal ${Math.round(settings.mediaMaxBytes / 1048576)} MB yaa~ (｡•́︿•̀｡)`
        },
        { quoted: message }
      );
      return;
    }

    const waitSeconds = takeUserMediaSlot(message.key.participant || message.key.remoteJid, settings.mediaUserCooldownMs);
    if (waitSeconds) {
      await sock.sendMessage(
        message.key.remoteJid,
        { text: `Sabar yaa~ tunggu ${waitSeconds} detik lagi sebelum bikin stiker berikutnya (๑•̀ㅂ•́)و` },
        { quoted: message }
      );
      return;
    }

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

        return convertImageToSticker(mediaBuffer);
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
          text: "Maaf yaa, Fuuka belum bisa bikin stiker dari media ini. Coba media lain dulu~ (´；ω；`)"
        },
        { quoted: message }
      );
    }
  }
};

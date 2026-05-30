const crypto = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const ytdl = require("@distube/ytdl-core");

ffmpeg.setFfmpegPath(ffmpegPath);

const MAX_AUDIO_SECONDS = 10 * 60;
const YOUTUBE_URL_PATTERN = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/\S+/i;

function findYoutubeUrl(args) {
  const joinedArgs = args.join(" ");
  const match = joinedArgs.match(YOUTUBE_URL_PATTERN);

  return match?.[0] || "";
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

async function convertYoutubeAudioToMp3(url) {
  const tempId = crypto.randomUUID();
  const outputPath = path.join(os.tmpdir(), `youtube-audio-${tempId}.mp3`);

  try {
    const audioStream = ytdl(url, {
      quality: "highestaudio",
      filter: "audioonly",
      highWaterMark: 1 << 25
    });

    await new Promise((resolve, reject) => {
      ffmpeg(audioStream)
        .audioBitrate(128)
        .audioCodec("libmp3lame")
        .format("mp3")
        .save(outputPath)
        .on("end", resolve)
        .on("error", reject);
    });

    return fs.readFile(outputPath);
  } finally {
    await fs.unlink(outputPath).catch(() => {});
  }
}

module.exports = {
  name: "audio",
  aliases: ["mp3", "ytmp3"],
  description: "Mengunduh audio MP3 dari link YouTube.",
  execute: async ({ sock, message, args = [], prefix }) => {
    const url = findYoutubeUrl(args);

    if (!url) {
      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: `Kirim link YouTube yaa.\nContoh: ${prefix}mp3 https://youtu.be/xxxx`
        },
        {
          quoted: message
        }
      );
      return;
    }

    if (!ytdl.validateURL(url)) {
      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: "Link YouTube-nya belum valid. Coba kirim link video YouTube biasa yaa."
        },
        {
          quoted: message
        }
      );
      return;
    }

    let info;

    try {
      info = await ytdl.getInfo(url);
    } catch (error) {
      console.error("[AUDIO ERROR] Gagal mengambil info YouTube:", error);
      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: "Fuuka belum bisa membaca link YouTube itu. Coba link lain yaa."
        },
        {
          quoted: message
        }
      );
      return;
    }

    const details = info.videoDetails;
    const title = details.title || "YouTube Audio";
    const durationSeconds = Number(details.lengthSeconds || 0);

    if (durationSeconds > MAX_AUDIO_SECONDS) {
      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: `Audio terlalu panjang (${formatDuration(durationSeconds)}). Maksimal ${formatDuration(MAX_AUDIO_SECONDS)} yaa.`
        },
        {
          quoted: message
        }
      );
      return;
    }

    await sock.sendMessage(
      message.key.remoteJid,
      {
        text: `Sedang ambil audio YouTube...\nJudul: ${title}\nDurasi: ${formatDuration(durationSeconds)}`
      },
      {
        quoted: message
      }
    );

    try {
      const audioBuffer = await convertYoutubeAudioToMp3(url);

      await sock.sendMessage(
        message.key.remoteJid,
        {
          audio: audioBuffer,
          mimetype: "audio/mpeg",
          fileName: `${title}.mp3`
        },
        {
          quoted: message
        }
      );
    } catch (error) {
      console.error("[AUDIO ERROR] Gagal mengunduh audio YouTube:", error);
      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: "Maaf, audio YouTube-nya gagal diproses. Coba lagi nanti atau pakai link lain yaa."
        },
        {
          quoted: message
        }
      );
    }
  }
};

const crypto = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const ytdl = require("@distube/ytdl-core");
const settings = require("../config/settings");

ffmpeg.setFfmpegPath(ffmpegPath);

const MAX_AUDIO_SECONDS = 10 * 60;
const YOUTUBE_URL_PATTERN = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/\S+/i;
const YOUTUBE_PLAYER_CLIENT_FALLBACKS = [
  ["WEB", "WEB_EMBEDDED", "IOS", "ANDROID", "TV"],
  ["WEB"],
  ["WEB_EMBEDDED"],
  ["TV"],
  ["IOS"],
  ["ANDROID"]
];

let youtubeAgent;
let youtubeAgentLoaded = false;

function isYoutubeBotChallenge(error) {
  return /sign in to confirm|not a bot|confirm you.?re not a bot/i.test(error?.message || "");
}

function isYoutubeFormatError(error) {
  return /playable formats|no formats|no playable|no such format/i.test(error?.message || "");
}

async function loadYoutubeCookies() {
  if (settings.youtubeCookiesJson) {
    return JSON.parse(settings.youtubeCookiesJson);
  }

  if (settings.youtubeCookiesPath) {
    const cookieJson = await fs.readFile(settings.youtubeCookiesPath, "utf8");
    return JSON.parse(cookieJson);
  }

  return null;
}

async function getYoutubeRequestOptions() {
  if (youtubeAgentLoaded) {
    return youtubeAgent ? { agent: youtubeAgent } : {};
  }

  youtubeAgentLoaded = true;

  try {
    const cookies = await loadYoutubeCookies();

    if (cookies) {
      youtubeAgent = ytdl.createAgent(cookies);
      console.log("[AUDIO] YouTube cookies aktif untuk downloader.");
    }
  } catch (error) {
    console.error("[AUDIO ERROR] Gagal membaca YouTube cookies:", error);
  }

  return youtubeAgent ? { agent: youtubeAgent } : {};
}

async function createYoutubeOptions(extraOptions = {}) {
  const youtubeOptions = await getYoutubeRequestOptions();

  return {
    ...youtubeOptions,
    ...extraOptions,
    requestOptions: {
      ...(youtubeOptions.requestOptions || {}),
      ...(extraOptions.requestOptions || {}),
      headers: {
        ...(youtubeOptions.requestOptions?.headers || {}),
        ...(extraOptions.requestOptions?.headers || {})
      }
    }
  };
}

async function getYoutubeInfoWithFallback(url) {
  let lastError;

  for (const playerClients of YOUTUBE_PLAYER_CLIENT_FALLBACKS) {
    const youtubeOptions = await createYoutubeOptions({ playerClients });

    try {
      const info = await ytdl.getInfo(url, youtubeOptions);
      return { info, youtubeOptions };
    } catch (error) {
      lastError = error;
      console.error(`[AUDIO ERROR] Gagal mengambil info YouTube dengan client ${playerClients.join(",")}:`, error);

      if (!isYoutubeFormatError(error)) {
        break;
      }
    }
  }

  throw lastError;
}

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

function chooseAudioFormat(info) {
  const formats = Array.isArray(info?.formats) ? info.formats : [];
  const audioFormats = formats
    .filter((format) => format?.url && format.hasAudio)
    .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
  const audioOnlyFormat = audioFormats.find((format) => !format.hasVideo);

  return audioOnlyFormat || audioFormats[0] || null;
}

async function convertYoutubeAudioToMp3(info, youtubeOptions) {
  const tempId = crypto.randomUUID();
  const outputPath = path.join(os.tmpdir(), `youtube-audio-${tempId}.mp3`);
  const audioFormat = chooseAudioFormat(info);

  if (!audioFormat) {
    throw new Error("No playable audio format found");
  }

  try {
    const audioStream = ytdl.downloadFromInfo(info, {
      ...youtubeOptions,
      format: audioFormat,
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
    let youtubeOptions;

    try {
      ({ info, youtubeOptions } = await getYoutubeInfoWithFallback(url));
    } catch (error) {
      console.error("[AUDIO ERROR] Gagal mengambil info YouTube:", error);
      const text = isYoutubeBotChallenge(error)
        ? "YouTube sedang meminta verifikasi anti-bot dari server ini, jadi audio belum bisa diambil. Coba refresh YouTube cookies di server."
        : isYoutubeFormatError(error)
          ? "YouTube belum memberi format audio yang bisa diunduh dari server ini. Coba refresh cookies YouTube, atau coba link lain."
          : "Fuuka belum bisa membaca link YouTube itu. Coba link lain yaa.";

      await sock.sendMessage(
        message.key.remoteJid,
        {
          text
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
      const audioBuffer = await convertYoutubeAudioToMp3(info, youtubeOptions);

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
      const text = isYoutubeBotChallenge(error)
        ? "YouTube sedang meminta verifikasi anti-bot dari server ini, jadi audio belum bisa diunduh. Coba refresh YouTube cookies di server."
        : isYoutubeFormatError(error)
          ? "YouTube belum memberi format audio yang bisa diunduh dari server ini. Coba refresh cookies YouTube, atau coba link lain."
          : "Maaf, audio YouTube-nya gagal diproses. Coba lagi nanti atau pakai link lain yaa.";

      await sock.sendMessage(
        message.key.remoteJid,
        {
          text
        },
        {
          quoted: message
        }
      );
    }
  }
};

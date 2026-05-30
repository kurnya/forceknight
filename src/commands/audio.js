const crypto = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const ffmpegPath = require("ffmpeg-static");
const ytDlp = require("yt-dlp-exec");

const settings = require("../config/settings");

const MAX_AUDIO_SECONDS = 10 * 60;
const MAX_DOWNLOAD_SIZE = "15M";
const YOUTUBE_URL_PATTERN = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/\S+/i;

function findYoutubeUrl(args) {
  const joinedArgs = args.join(" ");
  const match = joinedArgs.match(YOUTUBE_URL_PATTERN);

  return match?.[0] || "";
}

function getYoutubeVideoId(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.replace(/^www\.|^m\./, "");

    if (hostname === "youtu.be") {
      return parsedUrl.pathname.split("/").filter(Boolean)[0] || "";
    }

    if (hostname === "youtube.com") {
      if (parsedUrl.pathname === "/watch") {
        return parsedUrl.searchParams.get("v") || "";
      }

      const [, route, videoId] = parsedUrl.pathname.split("/");

      if (["embed", "shorts", "live"].includes(route)) {
        return videoId || "";
      }
    }
  } catch (_error) {
    return "";
  }

  return "";
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function isYoutubeBotChallenge(error) {
  const message = `${error?.message || ""}\n${error?.stderr || ""}`;

  return /sign in to confirm|not a bot|confirm you.?re not a bot/i.test(message);
}

function isYoutubeFormatError(error) {
  const message = `${error?.message || ""}\n${error?.stderr || ""}`;

  return /requested format|no video formats|no formats|unsupported url|403 forbidden|http error 403/i.test(message);
}

function toNetscapeCookieLine(cookie) {
  const domain = cookie.domain || ".youtube.com";
  const includeSubdomains = domain.startsWith(".") ? "TRUE" : "FALSE";
  const pathName = cookie.path || "/";
  const secure = cookie.secure ? "TRUE" : "FALSE";
  const expires = cookie.session ? "0" : String(Math.floor(Number(cookie.expirationDate || 0)));
  const name = cookie.name || "";
  const value = cookie.value || "";
  const domainPrefix = cookie.httpOnly ? "#HttpOnly_" : "";

  return `${domainPrefix}${domain}\t${includeSubdomains}\t${pathName}\t${secure}\t${expires}\t${name}\t${value}`;
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

async function createCookieFile() {
  let cookies;

  try {
    cookies = await loadYoutubeCookies();
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("[AUDIO ERROR] Gagal membaca YouTube cookies:", error);
    }

    return "";
  }

  if (!Array.isArray(cookies) || cookies.length === 0) {
    return "";
  }

  const cookiePath = path.join(os.tmpdir(), `youtube-cookies-${crypto.randomUUID()}.txt`);
  const cookieText = [
    "# Netscape HTTP Cookie File",
    ...cookies
      .filter((cookie) => cookie?.name && typeof cookie.value === "string")
      .map(toNetscapeCookieLine),
    ""
  ].join("\n");

  await fs.writeFile(cookiePath, cookieText, "utf8");
  console.log("[AUDIO] YouTube cookies aktif untuk downloader.");

  return cookiePath;
}

function createBaseFlags(cookiePath) {
  return {
    noPlaylist: true,
    noWarnings: true,
    noCallHome: true,
    cookies: cookiePath || undefined
  };
}

async function getYoutubeInfo(url, cookiePath) {
  return ytDlp(url, {
    ...createBaseFlags(cookiePath),
    dumpSingleJson: true,
    skipDownload: true
  });
}

async function downloadYoutubeAudio(url, cookiePath) {
  const tempId = crypto.randomUUID();
  const outputTemplate = path.join(os.tmpdir(), `youtube-audio-${tempId}.%(ext)s`);
  const outputPath = path.join(os.tmpdir(), `youtube-audio-${tempId}.mp3`);

  try {
    await ytDlp.exec(url, {
      ...createBaseFlags(cookiePath),
      extractAudio: true,
      audioFormat: "mp3",
      audioQuality: "128K",
      output: outputTemplate,
      ffmpegLocation: ffmpegPath,
      maxFilesize: MAX_DOWNLOAD_SIZE
    });

    return fs.readFile(outputPath);
  } finally {
    await Promise.allSettled([
      fs.unlink(outputPath),
      fs.unlink(path.join(os.tmpdir(), `youtube-audio-${tempId}.webm`)),
      fs.unlink(path.join(os.tmpdir(), `youtube-audio-${tempId}.m4a`))
    ]);
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

    if (!getYoutubeVideoId(url)) {
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

    const cookiePath = await createCookieFile();

    let info;

    try {
      info = await getYoutubeInfo(url, cookiePath);
    } catch (error) {
      console.error("[AUDIO ERROR] Gagal mengambil info YouTube:", error);
      const text = isYoutubeBotChallenge(error)
        ? "YouTube sedang meminta verifikasi anti-bot dari server ini, jadi audio belum bisa diambil. Coba refresh YouTube cookies di server."
        : isYoutubeFormatError(error)
          ? "YouTube belum memberi format audio yang bisa diunduh dari server ini. Coba refresh cookies YouTube, atau coba link lain."
          : "Fuuka belum bisa membaca link YouTube itu. Coba link lain yaa.";

      await fs.unlink(cookiePath).catch(() => {});
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

    const title = info.title || "YouTube Audio";
    const durationSeconds = Number(info.duration || 0);

    if (durationSeconds > MAX_AUDIO_SECONDS) {
      await fs.unlink(cookiePath).catch(() => {});
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
      const audioBuffer = await downloadYoutubeAudio(url, cookiePath);

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
    } finally {
      await fs.unlink(cookiePath).catch(() => {});
    }
  }
};

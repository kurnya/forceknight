const crypto = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const { create: createYtDlp } = require("youtube-dl-exec");

const settings = require("../config/settings");
const { runMediaJob } = require("../utils/mediaQueue");

// Cari binary yt-dlp — coba beberapa lokasi secara berurutan
function resolveYtDlpBinary() {
  const candidates = [
    // 1. Binary yang di-download oleh npm postinstall (lokasi default youtube-dl-exec)
    path.join(__dirname, "../../node_modules/youtube-dl-exec/bin/yt-dlp"),
    // 2. System binary (kalau di-install manual di server)
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
    // 3. Fallback: cari di PATH
    (() => {
      try { return execSync("which yt-dlp", { stdio: ["pipe", "pipe", "ignore"] }).toString().trim(); } catch { return null; }
    })(),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      // Cek apakah file ada dan executable
      require("fs").accessSync(candidate, require("fs").constants.X_OK);
      console.log(`[AUDIO] yt-dlp binary ditemukan: ${candidate}`);
      return candidate;
    } catch {
      // Lanjut ke kandidat berikutnya
    }
  }

  console.warn("[AUDIO] yt-dlp binary tidak ditemukan di semua lokasi. Audio command mungkin tidak berfungsi.");
  return null;
}

const ytDlpBinary = resolveYtDlpBinary();
const ytDlp = ytDlpBinary ? createYtDlp(ytDlpBinary) : require("youtube-dl-exec");

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

function isYoutubeDrmProtected(error) {
  const message = `${error?.message || ""}\n${error?.stderr || ""}`;
  return /drm protected|drm-protected/i.test(message);
}

function isYoutubeUnavailable(error) {
  const message = `${error?.message || ""}\n${error?.stderr || ""}`;
  return /video unavailable|private video|members.only|age.restricted|not available/i.test(message);
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
    // noCallHome deprecated di yt-dlp terbaru — dihapus
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
  const webmPath = path.join(os.tmpdir(), `youtube-audio-${tempId}.webm`);
  const m4aPath = path.join(os.tmpdir(), `youtube-audio-${tempId}.m4a`);
  const mp3Path = path.join(os.tmpdir(), `youtube-audio-${tempId}.mp3`);

  let downloadedPath = null;

  try {
    // Download audio-only tanpa post-processing (tidak butuh ffprobe)
    // Pakai client tv/mweb sebagai fallback untuk bypass 403 di server hosting
    await ytDlp.exec(url, {
      ...createBaseFlags(cookiePath),
      format: "bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio",
      output: outputTemplate,
      noPostOverwrites: true,
      maxFilesize: settings.audioMaxDownloadSize,
      concurrentFragments: 1,
      extractorArgs: "youtube:player_client=tv,web"
      // TIDAK pakai extractAudio/audioFormat — yt-dlp tidak perlu ffprobe
    });

    // Cek file mana yang ter-download
    for (const candidate of [webmPath, m4aPath]) {
      try {
        await fs.access(candidate);
        downloadedPath = candidate;
        break;
      } catch { /* lanjut */ }
    }

    if (!downloadedPath) {
      throw new Error("File audio tidak ditemukan setelah download.");
    }

    // Konversi ke mp3 pakai ffmpeg langsung (tidak butuh ffprobe)
    await new Promise((resolve, reject) => {
      const ffmpeg = require("fluent-ffmpeg");
      const ffmpegStatic = require("ffmpeg-static");
      ffmpeg.setFfmpegPath(ffmpegStatic);

      let timedOut = false;
      let proc = null;

      const timeoutId = setTimeout(() => {
        timedOut = true;
        try { proc?.kill("SIGKILL"); } catch (_) {}
        reject(new Error("FFmpeg timeout"));
      }, settings.ffmpegTimeoutMs);

      proc = ffmpeg(downloadedPath)
        .outputOptions([
          `-b:a ${settings.audioBitrate}`,
          "-threads 1",
          "-vn"
        ])
        .format("mp3")
        .save(mp3Path)
        .on("end", () => { clearTimeout(timeoutId); if (!timedOut) resolve(); })
        .on("error", (err) => { clearTimeout(timeoutId); if (!timedOut) reject(err); });
    });

    return fs.readFile(mp3Path);
  } finally {
    await Promise.allSettled([
      downloadedPath ? fs.unlink(downloadedPath) : Promise.resolve(),
      fs.unlink(mp3Path).catch(() => {})
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

    try {
      await runMediaJob(() => processYoutubeAudioCommand({ sock, message, url }));
    } catch (error) {
      if (error.code === "MEDIA_QUEUE_FULL") {
        await sock.sendMessage(
          message.key.remoteJid,
          {
            text: "Antrian audio sedang penuh. Coba lagi sebentar yaa~ (｡•́︿•̀｡)"
          },
          { quoted: message }
        );
        return;
      }

      console.error("[AUDIO ERROR]", error);

      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: "Maaf, audio YouTube-nya gagal diproses. Coba lagi nanti atau pakai link lain yaa."
        },
        { quoted: message }
      );
    }
  }
};

async function processYoutubeAudioCommand({ sock, message, url }) {
    const cookiePath = await createCookieFile();

    let info;

    try {
      info = await getYoutubeInfo(url, cookiePath);
    } catch (error) {
      console.error("[AUDIO ERROR] Gagal mengambil info YouTube:", error);
      const text = isYoutubeBotChallenge(error)
        ? "YouTube sedang meminta verifikasi anti-bot dari server ini, jadi audio belum bisa diambil. Coba refresh YouTube cookies di server."
        : isYoutubeDrmProtected(error)
          ? "Video ini diproteksi DRM dan tidak bisa diunduh~ Coba video lain yaa. (｡•́︿•̀｡)"
          : isYoutubeUnavailable(error)
            ? "Video ini tidak tersedia (privat, members only, atau dibatasi umur). Coba video lain yaa."
            : isYoutubeFormatError(error)
              ? "YouTube belum memberi format audio yang bisa diunduh dari server ini. Coba refresh cookies YouTube, atau coba link lain."
              : "Fuuka belum bisa membaca link YouTube itu. Coba link lain yaa.";

      await fs.unlink(cookiePath).catch(() => {});
      await sock.sendMessage(
        message.key.remoteJid,
        { text },
        { quoted: message }
      );
      return;
    }

    const title = info.title || "YouTube Audio";
    const durationSeconds = Number(info.duration || 0);

    if (durationSeconds > settings.audioMaxSeconds) {
      await fs.unlink(cookiePath).catch(() => {});
      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: `Audio terlalu panjang (${formatDuration(durationSeconds)}). Maksimal ${formatDuration(settings.audioMaxSeconds)} yaa.`
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
        : isYoutubeDrmProtected(error)
          ? "Video ini diproteksi DRM dan tidak bisa diunduh~ Coba video lain yaa. (｡•́︿•̀｡)"
          : isYoutubeUnavailable(error)
            ? "Video ini tidak tersedia (privat, members only, atau dibatasi umur). Coba video lain yaa."
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

const fs = require("fs/promises");
const os = require("os");
const path = require("path");

// Semua file temp yang dibuat bot: audio YouTube (termasuk .part dari yt-dlp),
// file cookies sementara, dan file kerja stiker video.
const TEMP_FILE_RULES = [
  { prefix: "youtube-audio-", extensions: new Set([".m4a", ".mp3", ".webm", ".mp4", ".mkv", ".flv", ".aac", ".ogg", ".opus", ".part", ".ytdl"]) },
  { prefix: "youtube-cookies-", extensions: new Set([".txt"]) },
  { prefix: "stiker-", extensions: new Set([".mp4", ".webp"]) }
];

function isBotTempFile(fileName) {
  const ext = path.extname(fileName);
  return TEMP_FILE_RULES.some((rule) => fileName.startsWith(rule.prefix) && rule.extensions.has(ext));
}

async function cleanupYoutubeAudioTempFiles(maxAgeMs) {
  const tempDir = os.tmpdir();
  const now = Date.now();
  let deletedCount = 0;

  let entries;

  try {
    entries = await fs.readdir(tempDir, { withFileTypes: true });
  } catch (error) {
    console.error("[CLEANUP ERROR] Gagal membaca folder temp:", error);
    return deletedCount;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !isBotTempFile(entry.name)) {
      continue;
    }

    const filePath = path.join(tempDir, entry.name);

    try {
      const stats = await fs.stat(filePath);
      const fileAgeMs = now - stats.mtimeMs;

      if (fileAgeMs < maxAgeMs) {
        continue;
      }

      await fs.unlink(filePath);
      deletedCount += 1;
    } catch (error) {
      console.error(`[CLEANUP ERROR] Gagal menghapus file temp ${entry.name}:`, error);
    }
  }

  return deletedCount;
}

function startTempCleanupScheduler(settings) {
  if (!settings.tempCleanupEnabled) {
    console.log("[CLEANUP] Pembersihan temp otomatis dinonaktifkan.");
    return;
  }

  const runCleanup = async () => {
    const deletedCount = await cleanupYoutubeAudioTempFiles(settings.tempCleanupMaxAgeMs);

    if (deletedCount > 0) {
      console.log(`[CLEANUP] Menghapus ${deletedCount} file temp lama.`);
    }
  };

  const startupTimer = setTimeout(() => {
    runCleanup().catch((error) => {
      console.error("[CLEANUP ERROR] Gagal menjalankan pembersihan awal:", error);
    });
  }, settings.tempCleanupStartupDelayMs);

  const dailyTimer = setInterval(() => {
    runCleanup().catch((error) => {
      console.error("[CLEANUP ERROR] Gagal menjalankan pembersihan harian:", error);
    });
  }, settings.tempCleanupIntervalMs);

  startupTimer.unref?.();
  dailyTimer.unref?.();

  console.log(`[CLEANUP] Pembersihan temp aktif setiap ${Math.round(settings.tempCleanupIntervalMs / 3600000)} jam.`);
}

module.exports = {
  cleanupYoutubeAudioTempFiles,
  startTempCleanupScheduler
};

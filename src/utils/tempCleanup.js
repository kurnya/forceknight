const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const YOUTUBE_AUDIO_PREFIX = "youtube-audio-";
const YOUTUBE_AUDIO_EXTENSIONS = new Set([".m4a", ".mp3"]);

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
    if (
      !entry.isFile() ||
      !entry.name.startsWith(YOUTUBE_AUDIO_PREFIX) ||
      !YOUTUBE_AUDIO_EXTENSIONS.has(path.extname(entry.name))
    ) {
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
      console.log(`[CLEANUP] Menghapus ${deletedCount} file audio temp lama.`);
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

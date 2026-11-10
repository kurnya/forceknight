// Log diagnostik ringan untuk melacak kenapa proses mati tanpa jejak di hosting
// (mis. dimatikan karena memori habis, yang tidak bisa ditangkap oleh process.on).
// Baris [HEARTBEAT] terakhir sebelum log berhenti menunjukkan memori dan status saat itu.

const MB = 1024 * 1024;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDuration(totalSec) {
  const s = Math.floor(totalSec);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${pad2(s % 60)}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}j${pad2(Math.floor((s % 3600) / 60))}m`;
  return `${Math.floor(s / 86400)}h${pad2(Math.floor((s % 86400) / 3600))}j`;
}

function formatHeartbeat(mem, uptimeSec, waStatus) {
  const parts = [
    `uptime=${formatDuration(uptimeSec)}`,
    `rss=${Math.round(mem.rss / MB)}MB`,
    `heap=${Math.round(mem.heapUsed / MB)}/${Math.round(mem.heapTotal / MB)}MB`
  ];
  if (waStatus) parts.push(`wa=${waStatus}`);
  return `[HEARTBEAT] ${parts.join(" ")}`;
}

// Mulai heartbeat berkala. Timer di-unref agar tidak menahan proses tetap hidup.
function startHeartbeat({ intervalMs = 5 * 60 * 1000, getStatus = () => undefined, log = console.log } = {}) {
  const timer = setInterval(() => {
    log(formatHeartbeat(process.memoryUsage(), process.uptime(), getStatus()));
  }, intervalMs);
  timer.unref?.();
  return timer;
}

module.exports = { formatDuration, formatHeartbeat, startHeartbeat };

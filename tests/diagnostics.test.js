const test = require("node:test");
const assert = require("node:assert/strict");
const { formatHeartbeat, formatDuration } = require("../src/utils/diagnostics");

const MB = 1024 * 1024;

test("formatDuration: detik, menit, jam, hari", () => {
  assert.equal(formatDuration(45), "45s");
  assert.equal(formatDuration(125), "2m05s");
  assert.equal(formatDuration(3 * 3600 + 7 * 60), "3j07m");
  assert.equal(formatDuration(2 * 86400 + 5 * 3600), "2h05j");
});

test("formatHeartbeat: memuat uptime, rss, heap, dan batas bila diketahui", () => {
  const line = formatHeartbeat({ rss: 210 * MB, heapUsed: 95 * MB, heapTotal: 120 * MB }, 3700);
  assert.match(line, /^\[HEARTBEAT\]/);
  assert.match(line, /uptime=1j01m/);
  assert.match(line, /rss=210MB/);
  assert.match(line, /heap=95\/120MB/);
});

test("formatHeartbeat: menyertakan status koneksi bila diberikan", () => {
  const line = formatHeartbeat({ rss: 100 * MB, heapUsed: 50 * MB, heapTotal: 60 * MB }, 10, "open");
  assert.match(line, /wa=open/);
});

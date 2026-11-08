// Mengambil master data dari Google Sheet lewat Apps Script Web App (aksi read, publik).
// Urutan sumber: cache memori (segar) → fetch → cache memori kedaluwarsa → salinan disk → null.
// getTab tidak pernah melempar; pemanggil yang menentukan cadangan terakhir.

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_CACHE_DIR = path.join(__dirname, "..", "data", "cache");
const TAB_NAME = /^[a-z0-9_]+$/i;

function createMasterData(options = {}) {
  const url = options.url !== undefined ? options.url : process.env.MASTER_DATA_URL;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || Date.now;
  const cacheDir = options.cacheDir || DEFAULT_CACHE_DIR;
  const ttlMs = options.ttlMs || DEFAULT_TTL_MS;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  const memory = new Map(); // tab -> { rows, at }

  async function fetchRows(tab) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${url}?action=read&tab=${tab}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      if (!payload || payload.ok !== true || !Array.isArray(payload.data)) {
        throw new Error((payload && payload.error) || "respons tidak valid");
      }
      return payload.data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function writeDisk(tab, rows) {
    try {
      await fs.promises.mkdir(cacheDir, { recursive: true });
      await fs.promises.writeFile(path.join(cacheDir, `${tab}.json`), JSON.stringify(rows));
    } catch (err) {
      console.warn(`[masterData] gagal menulis salinan disk ${tab}: ${err.message}`);
    }
  }

  async function readDisk(tab) {
    try {
      const rows = JSON.parse(await fs.promises.readFile(path.join(cacheDir, `${tab}.json`), "utf8"));
      return Array.isArray(rows) ? rows : null;
    } catch {
      return null;
    }
  }

  async function getTab(tab) {
    if (!url || !TAB_NAME.test(String(tab))) return null;

    const cached = memory.get(tab);
    if (cached && now() - cached.at < ttlMs) return cached.rows;

    try {
      const rows = await fetchRows(tab);
      memory.set(tab, { rows, at: now() });
      await writeDisk(tab, rows);
      return rows;
    } catch (err) {
      console.warn(`[masterData] fetch ${tab} gagal: ${err.message}`);
      if (cached) return cached.rows;
      return readDisk(tab);
    }
  }

  return { getTab };
}

const defaultInstance = createMasterData();

module.exports = { createMasterData, getTab: (tab) => defaultInstance.getTab(tab) };

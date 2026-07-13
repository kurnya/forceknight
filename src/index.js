// UV_THREADPOOL_SIZE harus di-set sebelum I/O apapun (dotenv terlambat untuk ini).
if (!process.env.UV_THREADPOOL_SIZE) {
  process.env.UV_THREADPOOL_SIZE = "4";
}

const http = require("http");
const path = require("path");
const {
  default: makeWASocket,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} = require("@whiskeysockets/baileys");
const P = require("pino");
const qrcode = require("qrcode-terminal");
const sharp = require("sharp");

const settings = require("./config/settings");
const { handleMessage, setBotLid, resetBotLid, tryCaptureBotLid } = require("./handlers/messageHandler");
const { startTempCleanupScheduler } = require("./utils/tempCleanup");
const { configureMediaQueue, drainMediaQueue } = require("./utils/mediaQueue");

sharp.concurrency(settings.sharpConcurrency);
configureMediaQueue({
  maxConcurrent: settings.mediaMaxConcurrent,
  queueLimit: settings.mediaQueueLimit
});

const AUTH_DIR = path.join(process.cwd(), "auth");

let isStarting = false;
let reconnectTimer = null;
let httpServerStarted = false;
let activeSocket = null;
let reconnectAttempts = 0;

const MAX_RECONNECT_DELAY_MS = 60000;

// Status codes yang TIDAK boleh reconnect
const NO_RECONNECT_CODES = new Set([
  DisconnectReason.loggedOut,   // 401
  DisconnectReason.forbidden,   // 403
  DisconnectReason.badSession,  // 500
]);

// Status codes yang butuh delay lebih panjang
const SLOW_RECONNECT_CODES = new Set([
  DisconnectReason.connectionReplaced, // 440
  DisconnectReason.unavailableService, // 503
]);

// ─── Cache versi WA ───────────────────────────────────────────────────────────
// Fetch sekali saja saat startup — tidak perlu ulang setiap reconnect
// Reconnect yang sering terjadi karena fetchLatestBaileysVersion() lambat bisa dihindari
let cachedWAVersion = null;

async function getWAVersion() {
  if (cachedWAVersion) return cachedWAVersion;
  try {
    const result = await fetchLatestBaileysVersion();
    cachedWAVersion = result.version;
    console.log(`[VERSION] WA version: ${cachedWAVersion.join(".")}`);
  } catch (err) {
    console.warn("[VERSION] Gagal fetch versi WA, pakai fallback:", err.message);
    cachedWAVersion = [2, 3000, 1023697848];
  }
  return cachedWAVersion;
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

function startHttpServer() {
  if (httpServerStarted) return;

  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      service: "whatsapp-bot",
      connected: activeSocket?.user != null,
      uptime: Math.floor(process.uptime())
    }));
  });

  server.listen(settings.port, () => {
    console.log(`[HTTP] Server aktif di port ${settings.port}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[HTTP ERROR] Port ${settings.port} sedang dipakai proses lain.`);
      return;
    }
    console.error("[HTTP ERROR]", err.message);
  });

  httpServerStarted = true;
}

// ─── Reconnect Logic ──────────────────────────────────────────────────────────

function scheduleReconnect(forceSlow = false) {
  if (reconnectTimer) return;

  if (forceSlow) {
    reconnectAttempts = Math.max(reconnectAttempts, 3);
  }

  // Exponential backoff: 5s → 10s → 20s → 40s → 60s (cap)
  const delay = Math.min(5000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY_MS);
  reconnectAttempts++;

  console.log(`[RECONNECT] Percobaan ke-${reconnectAttempts} dalam ${delay / 1000}s...`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startBot().catch((err) => {
      console.error("[RECONNECT ERROR]", err.message);
      scheduleReconnect();
    });
  }, delay);
}

function cancelReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

// ─── Socket Cleanup ───────────────────────────────────────────────────────────

function destroySocket(sock) {
  if (!sock) return;
  try {
    sock.ws?.removeAllListeners();
    sock.ev?.removeAllListeners();
    sock.end();
  } catch (_) { /* abaikan */ }
}

// ─── Bot Start ────────────────────────────────────────────────────────────────

async function startBot() {
  if (isStarting) return;
  isStarting = true;

  destroySocket(activeSocket);
  activeSocket = null;
  resetBotLid();

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    // Pakai cache — tidak fetch ulang setiap reconnect
    const version = await getWAVersion();

    // Cache pesan untuk retry decrypt (Bad MAC) — max 200 entri
    const msgCache = new Map();
    const MSG_CACHE_LIMIT = 200;

    const sock = makeWASocket({
      version,
      auth: state,
      logger: P({ level: "silent" }),

      // Fingerprint WA Web resmi
      browser: Browsers.appropriate("Chrome"),

      keepAliveIntervalMs: settings.whatsappKeepAliveMs,
      connectTimeoutMs: settings.whatsappConnectTimeoutMs,
      defaultQueryTimeoutMs: settings.whatsappDefaultQueryTimeoutMs,

      markOnlineOnConnect: false,
      printQRInTerminal: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      fireInitQueries: true,
      retryRequestDelayMs: 2000,

      // Diperlukan agar Baileys bisa retry pesan Bad MAC
      getMessage: async (key) => {
        return msgCache.get(key.id)?.message || undefined;
      },
    });

    activeSocket = sock;

    // Handle WebSocket error — cegah unhandled rejection
    sock.ws.on("error", (err) => {
      console.error("[WS ERROR]", err?.message || err);
    });

    // Simpan creds + tangkap LID sesegera mungkin
    sock.ev.on("creds.update", () => {
      saveCreds();
      const lid = state?.creds?.me?.lid;
      if (lid) setBotLid(lid);
    });

    // ── Connection state ──
    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("[QR] Scan QR berikut dari WhatsApp:");
        qrcode.generate(qr, { small: true });
        console.log(`[QR LINK] https://quickchart.io/qr?size=260&text=${encodeURIComponent(qr)}`);
      }

      if (connection === "open") {
        isStarting = false;
        reconnectAttempts = 0;
        cancelReconnect();

        console.log(`[CONNECTED] ${new Date().toISOString()} — Bot terhubung ke WhatsApp`);
        console.log(`[BOT INFO] ID: ${sock.user?.id} | LID: ${sock.user?.lid || "-"}`);

        // Tangkap LID dari semua sumber saat connect
        const lid =
          sock.user?.lid ||
          state?.creds?.me?.lid ||
          (typeof state?.creds?.me === "string" && state.creds.me.endsWith("@lid")
            ? state.creds.me : null);

        if (lid) {
          setBotLid(lid);
        } else {
          console.warn("[BOT LID] LID belum tersedia, akan dicoba dari pesan pertama.");
        }
      }

      if (connection === "close") {
        isStarting = false;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errMsg = lastDisconnect?.error?.message || "";
        const isStreamError = errMsg.toLowerCase().includes("stream errored");

        console.log(`[DISCONNECTED] ${new Date().toISOString()} — Code: ${statusCode} | ${errMsg || "no message"}`);

        if (NO_RECONNECT_CODES.has(statusCode)) {
          if (statusCode === DisconnectReason.badSession) {
            console.error("[BAD SESSION] Auth corrupt. Hapus folder 'auth' lalu scan ulang QR.");
          } else if (statusCode === DisconnectReason.forbidden) {
            console.error("[FORBIDDEN] Akun diblokir WhatsApp.");
          } else {
            console.log("[LOGOUT] Session logout. Hapus folder 'auth' lalu scan ulang QR.");
          }
          return;
        }

        if (statusCode === DisconnectReason.restartRequired) {
          console.log("[RESTART REQUIRED] WA minta restart session. Reconnect segera...");
          reconnectAttempts = 0;
          scheduleReconnect();
          return;
        }

        if (SLOW_RECONNECT_CODES.has(statusCode) || isStreamError) {
          console.log("[SLOW RECONNECT] Tunggu lebih lama sebelum reconnect...");
          scheduleReconnect(true);
          return;
        }

        scheduleReconnect();
      }
    });

    // ── Message handler ──
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      // Cache semua pesan untuk retry decrypt
      for (const msg of messages) {
        if (msg.key?.id && msg.message) {
          if (msgCache.size >= MSG_CACHE_LIMIT) {
            msgCache.delete(msgCache.keys().next().value);
          }
          msgCache.set(msg.key.id, msg);
        }
      }

      // Hanya proses pesan real-time, skip history sync
      if (type !== "notify") return;

      const [message] = messages;
      if (!message) return;

      await handleMessage(sock, message);
    });

    // Update cache saat pesan retry berhasil didekripsi
    sock.ev.on("messages.update", (updates) => {
      for (const update of updates) {
        if (update.update?.message && update.key?.id) {
          const existing = msgCache.get(update.key.id);
          if (existing) {
            msgCache.set(update.key.id, { ...existing, message: update.update.message });
          }
        }
      }
    });

  } catch (err) {
    console.error("[START ERROR]", err.message);
    isStarting = false;
    scheduleReconnect();
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

startHttpServer();
startTempCleanupScheduler(settings);

// Fetch versi WA di background saat startup — siap sebelum bot connect
getWAVersion();

process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION]", err);
});

async function gracefulShutdown(signal) {
  console.log(`[SHUTDOWN] ${signal} diterima. Menutup bot...`);
  cancelReconnect();
  drainMediaQueue();
  destroySocket(activeSocket);
  setTimeout(() => process.exit(0), 3000).unref?.();
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

startBot();

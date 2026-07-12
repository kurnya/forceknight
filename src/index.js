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
const { handleMessage, tryCaptureBotLid, setBotLid, resetBotLid } = require("./handlers/messageHandler");
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

// Batas delay reconnect: 60 detik maksimal
const MAX_RECONNECT_DELAY_MS = 60000;

// Status codes yang TIDAK boleh reconnect
const NO_RECONNECT_CODES = new Set([
  DisconnectReason.loggedOut,   // 401 — session di-logout dari HP
  DisconnectReason.forbidden,   // 403 — akun diblokir WA
  DisconnectReason.badSession,  // 500 — file auth corrupt
]);

// Status codes yang butuh delay lebih panjang sebelum reconnect
const SLOW_RECONNECT_CODES = new Set([
  DisconnectReason.connectionReplaced, // 440 — ada session lain yang aktif
  DisconnectReason.unavailableService, // 503 — WA server down
]);

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
    // Untuk connectionReplaced / unavailableService — mulai dari delay ke-3
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
  } catch (_) {
    // abaikan error saat cleanup
  }
}

// ─── Bot Start ────────────────────────────────────────────────────────────────

async function startBot() {
  if (isStarting) return;
  isStarting = true;

  // Cleanup socket lama dulu — cegah memory leak dan session conflict
  destroySocket(activeSocket);
  activeSocket = null;

  // Reset LID cache — LID lama tidak boleh bocor ke session baru
  resetBotLid();

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    let version;
    try {
      const result = await fetchLatestBaileysVersion();
      version = result.version;
    } catch (err) {
      console.warn("[VERSION] Gagal fetch versi WA, pakai fallback:", err.message);
      version = [2, 3000, 1023697848];
    }

    // Cache pesan untuk keperluan retry decrypt (Bad MAC / session mismatch)
    // Dibatasi 200 entri agar tidak bocor memory
    const msgCache = new Map();
    const MSG_CACHE_LIMIT = 200;

    const sock = makeWASocket({
      version,
      auth: state,
      logger: P({ level: "silent" }),

      // Fingerprint resmi WA Web — jauh lebih stable daripada custom browser string
      browser: Browsers.appropriate("Chrome"),

      keepAliveIntervalMs: settings.whatsappKeepAliveMs,
      connectTimeoutMs: settings.whatsappConnectTimeoutMs,
      defaultQueryTimeoutMs: settings.whatsappDefaultQueryTimeoutMs,

      markOnlineOnConnect: false,
      printQRInTerminal: false,

      // Matikan fitur yang tidak perlu — kurangi traffic ke WA server
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,

      // Pastikan init queries jalan untuk stabilitas session jangka panjang
      fireInitQueries: true,

      // Retry decode pesan yang gagal — cegah crash karena pesan corrupt
      retryRequestDelayMs: 2000,

      // Callback untuk retry pesan Bad MAC / session mismatch setelah auth ulang.
      // Baileys memanggil ini saat perlu re-request konten pesan yang gagal didekripsi.
      getMessage: async (key) => {
        const cached = msgCache.get(key.id);
        return cached?.message || undefined;
      },
    });

    activeSocket = sock;

    // ── Tangkap WebSocket error — cegah unhandled rejection ──
    sock.ws.on("error", (err) => {
      console.error("[WS ERROR]", err?.message || err);
      // connection.update 'close' akan trigger reconnect — tidak perlu di sini
    });

    // ── Simpan creds setiap update + tangkap LID dari creds.me sesegera mungkin ──
    sock.ev.on("creds.update", () => {
      saveCreds();
      // creds.me.lid terisi setelah Baileys terima info akun dari server WA
      // Ini sumber LID paling cepat — jauh sebelum pesan fromMe pertama datang
      const lid = state?.creds?.me?.lid;
      if (lid) setBotLid(lid);
    });

    // ── Connection state handler ──
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("[QR] Scan QR code berikut dari WhatsApp:");
        qrcode.generate(qr, { small: true });
        console.log(`[QR LINK] https://quickchart.io/qr?size=260&text=${encodeURIComponent(qr)}`);
      }

      if (connection === "open") {
        isStarting = false;
        reconnectAttempts = 0;
        cancelReconnect();

        console.log(`[CONNECTED] ${new Date().toISOString()} — Bot terhubung ke WhatsApp`);
        console.log(`[BOT INFO] ID: ${sock.user?.id} | LID: ${sock.user?.lid || "-"}`);

        // Tangkap LID dari semua sumber yang tersedia saat connect
        // Prioritas: sock.user.lid > creds.me.lid > creds.me (object langsung)
        const lid =
          sock.user?.lid ||
          state?.creds?.me?.lid ||
          (typeof state?.creds?.me === "string" && state.creds.me.endsWith("@lid")
            ? state.creds.me
            : null);

        if (lid) {
          setBotLid(lid);
        } else {
          console.warn("[BOT LID] LID tidak tersedia saat connect. Akan dicoba dari pesan pertama.");
        }
      }

      if (connection === "close") {
        isStarting = false;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errMsg = lastDisconnect?.error?.message || "";
        const isStreamError = errMsg.toLowerCase().includes("stream errored");

        console.log(`[DISCONNECTED] ${new Date().toISOString()} — Code: ${statusCode} | ${errMsg || "no message"}`);

        // ── Status yang tidak boleh reconnect ──
        if (NO_RECONNECT_CODES.has(statusCode)) {
          if (statusCode === DisconnectReason.badSession) {
            console.error("[BAD SESSION] File auth corrupt. Hapus folder 'auth' lalu scan ulang QR.");
          } else if (statusCode === DisconnectReason.forbidden) {
            console.error("[FORBIDDEN] Akun diblokir oleh WhatsApp.");
          } else {
            console.log("[LOGOUT] Session logout. Hapus folder 'auth' lalu scan ulang QR.");
          }
          return; // berhenti total
        }

        // ── restartRequired (515) — WA minta bot restart session ──
        // Ini normal terjadi setiap beberapa jam, bukan error
        if (statusCode === DisconnectReason.restartRequired) {
          console.log("[RESTART REQUIRED] WA meminta restart session. Reconnect segera...");
          reconnectAttempts = 0; // reset agar langsung reconnect tanpa delay panjang
          scheduleReconnect();
          return;
        }

        // ── connectionReplaced / unavailableService / stream error ──
        // Tunggu lebih lama — ada session lain aktif atau server WA sedang down
        if (SLOW_RECONNECT_CODES.has(statusCode) || isStreamError) {
          console.log("[SLOW RECONNECT] Menunggu lebih lama sebelum reconnect...");
          scheduleReconnect(true); // forceSlow = true
          return;
        }

        // ── Semua error lainnya — reconnect normal dengan backoff ──
        scheduleReconnect();
      }
    });

    // ── Message handler ──
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      for (const message of messages) {
        // Simpan ke cache untuk keperluan retry decrypt
        if (message.key?.id && message.message) {
          if (msgCache.size >= MSG_CACHE_LIMIT) {
            // Hapus entri paling lama (FIFO)
            const firstKey = msgCache.keys().next().value;
            msgCache.delete(firstKey);
          }
          msgCache.set(message.key.id, message);
        }
      }

      // Hanya proses pesan baru (type 'notify'), bukan history sync
      if (type !== "notify") return;

      const [message] = messages || [];
      if (!message) return;
      await handleMessage(sock, message);
    });

    // ── Handle retry pesan yang gagal didekripsi (Bad MAC) ──
    // Baileys otomatis re-request pesan dan memanggil ini saat berhasil
    sock.ev.on("messages.update", (updates) => {
      for (const update of updates) {
        if (update.update?.message && update.key?.id) {
          // Update cache dengan konten pesan yang baru berhasil didekripsi
          const existing = msgCache.get(update.key.id);
          if (existing) {
            msgCache.set(update.key.id, { ...existing, message: update.update.message });
          }
        }
      }
    });

    // ── Tangkap LID bot dari event grup sebagai fallback ──
    // Tidak bisa dipakai langsung karena cachedBotLid ada di messageHandler scope
    // tryCaptureBotLid dari pesan fromMe sudah cukup sebagai fallback


  } catch (err) {
    console.error("[START ERROR]", err.message);
    isStarting = false;
    scheduleReconnect();
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

startHttpServer();
startTempCleanupScheduler(settings);

process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION]", err);
  // Jangan crash — biarkan reconnect logic yang handle
});

async function gracefulShutdown(signal) {
  console.log(`[SHUTDOWN] ${signal} diterima. Menutup bot...`);
  cancelReconnect();
  drainMediaQueue();
  destroySocket(activeSocket);

  setTimeout(() => {
    process.exit(0);
  }, 3000).unref?.();
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

startBot();

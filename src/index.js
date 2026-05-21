const http = require("http");
const path = require("path");
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} = require("@whiskeysockets/baileys");
const P = require("pino");
const qrcode = require("qrcode-terminal");

const settings = require("./config/settings");
const { handleMessage } = require("./handlers/messageHandler");

const AUTH_DIR = path.join(process.cwd(), "auth");

let isStarting = false;
let reconnectTimer = null;
let httpServerStarted = false;

function startHttpServer() {
  if (httpServerStarted) {
    return;
  }

  const server = http.createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        status: "ok",
        service: "whatsapp-bot"
      })
    );
  });

  server.listen(settings.port, () => {
    console.log(`[HTTP] Server aktif di port ${settings.port}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`[HTTP ERROR] Port ${settings.port} sedang dipakai proses lain.`);
      return;
    }

    console.error("[HTTP ERROR] Gagal menjalankan HTTP server:", error);
  });

  httpServerStarted = true;
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startBot().catch((error) => {
      console.error("[RECONNECT ERROR] Gagal reconnect:", error);
    });
  }, 5000);
}

async function startBot() {
  if (isStarting) {
    return;
  }

  isStarting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: P({ level: "silent" }),
      browser: ["Fuuka Bot", "Chrome", "1.0.0"],
      keepAliveIntervalMs: settings.whatsappKeepAliveMs,
      connectTimeoutMs: settings.whatsappConnectTimeoutMs,
      defaultQueryTimeoutMs: settings.whatsappDefaultQueryTimeoutMs,
      markOnlineOnConnect: false,
      printQRInTerminal: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("[QR] QR code berhasil dibuat. Silakan scan dari WhatsApp.");
        qrcode.generate(qr, { small: true });
        console.log(`[QR LINK] Buka link ini kalau QR di console terlalu besar: https://quickchart.io/qr?size=260&text=${encodeURIComponent(qr)}`);
      }

      if (connection === "open") {
        console.log("[CONNECTED] Bot berhasil terhubung ke WhatsApp.");
        console.log(`[CONFIG] Prefix aktif: ${settings.prefix}`);
        console.log(`[CONFIG] Port: ${settings.port}`);
        console.log(`[SESSION] Session tersimpan di: ${AUTH_DIR}`);
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log("[DISCONNECTED] Koneksi terputus. Status code:", statusCode);

        if (shouldReconnect) {
          console.log("[RECONNECT] Mencoba menghubungkan ulang bot dalam 5 detik...");
          scheduleReconnect();
        } else {
          console.log("[SESSION] Session logout. Hapus folder auth lalu login ulang.");
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      const [message] = messages || [];

      if (!message) {
        return;
      }

      await handleMessage(sock, message);
    });
  } catch (error) {
    console.error("[START ERROR] Gagal menjalankan bot:", error);
    console.log("[RETRY] Mencoba restart bot dalam 5 detik...");
    scheduleReconnect();
  } finally {
    isStarting = false;
  }
}

startHttpServer();

startBot().catch((error) => {
  console.error("[FATAL] Bot gagal dijalankan:", error);
});

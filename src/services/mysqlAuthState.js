// Penyimpan sesi login WhatsApp (Baileys) di MySQL, sebagai pengganti folder auth/
// untuk hosting yang menghapus berkas saat deploy atau restart.
//
// Aturan penting: galat database TIDAK BOLEH berujung pada pembuatan sesi baru, karena itu
// akan menimpa sesi lama dan memaksa scan QR ulang. Karena itu galat dilempar, bukan ditelan.

const TABLE = "wa_auth";
const SESSION_NAME = /^[A-Za-z0-9_-]{1,64}$/;

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS ${TABLE} (
  session_name VARCHAR(64) NOT NULL,
  key_name VARCHAR(190) NOT NULL,
  value LONGTEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (session_name, key_name)
) CHARACTER SET utf8mb4`;

// Mengembalikan konfigurasi dari env, atau null bila AUTH_MYSQL_HOST kosong (mode folder auth/).
// Bila host diisi tapi ada yang kurang, melempar galat yang menyebut nama variabelnya.
function readMysqlConfig(env) {
  const host = String(env.AUTH_MYSQL_HOST || "").trim();
  if (!host) return null;

  const user = String(env.AUTH_MYSQL_USER || "").trim();
  const database = String(env.AUTH_MYSQL_DATABASE || "").trim();
  const password = String(env.AUTH_MYSQL_PASSWORD || "");
  if (!user) throw new Error("AUTH_MYSQL_USER belum diisi (AUTH_MYSQL_HOST sudah diisi)");
  if (!password) throw new Error("AUTH_MYSQL_PASSWORD belum diisi (AUTH_MYSQL_HOST sudah diisi)");
  if (!database) throw new Error("AUTH_MYSQL_DATABASE belum diisi (AUTH_MYSQL_HOST sudah diisi)");

  const rawPort = String(env.AUTH_MYSQL_PORT || "").trim();
  if (rawPort && !/^\d+$/.test(rawPort)) throw new Error("AUTH_MYSQL_PORT harus berupa angka");
  const port = rawPort ? Number(rawPort) : 3306;

  const session = String(env.AUTH_MYSQL_SESSION || "fuuka").trim();
  if (!SESSION_NAME.test(session)) {
    throw new Error("AUTH_MYSQL_SESSION hanya boleh huruf, angka, '-' dan '_' (maks 64 karakter)");
  }

  return { host, port, user, password, database, session };
}

function createMysqlPool(config) {
  const mysql = require("mysql2/promise");
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 10000
  });
}

async function useMysqlAuthState({ pool, sessionName = "fuuka", baileys } = {}) {
  const { BufferJSON, initAuthCreds, proto } = baileys || require("@whiskeysockets/baileys");

  const dbError = (err) => new Error(`Gagal mengakses MySQL (${err.message})`);

  try {
    await pool.execute(CREATE_TABLE);
  } catch (err) {
    throw dbError(err);
  }

  // Tulis/hapus pada kunci yang sama dijalankan berurutan agar tulis lama tidak menimpa tulis baru.
  const queues = new Map();
  function serial(key, task) {
    const prev = queues.get(key) || Promise.resolve();
    const next = prev.catch(() => {}).then(task);
    queues.set(key, next);
    next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => {});
    return next;
  }

  async function readData(key, { strict = false } = {}) {
    let rows;
    try {
      [rows] = await pool.execute(`SELECT value FROM ${TABLE} WHERE session_name = ? AND key_name = ?`, [sessionName, key]);
    } catch (err) {
      throw dbError(err);
    }
    if (!rows || rows.length === 0) return null;
    try {
      return JSON.parse(rows[0].value, BufferJSON.reviver);
    } catch {
      if (strict) {
        throw new Error(`Data sesi "${key}" di MySQL rusak (bukan JSON valid). Perbaiki atau hapus barisnya di tabel ${TABLE}, lalu scan QR ulang.`);
      }
      return null;
    }
  }

  function writeData(key, data) {
    return serial(key, async () => {
      try {
        await pool.execute(
          `INSERT INTO ${TABLE} (session_name, key_name, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)`,
          [sessionName, key, JSON.stringify(data, BufferJSON.replacer)]
        );
      } catch (err) {
        throw dbError(err);
      }
    });
  }

  function removeData(key) {
    return serial(key, async () => {
      try {
        await pool.execute(`DELETE FROM ${TABLE} WHERE session_name = ? AND key_name = ?`, [sessionName, key]);
      } catch (err) {
        throw dbError(err);
      }
    });
  }

  // creds rusak/tidak terbaca = berhenti dengan galat, bukan membuat creds baru.
  const creds = (await readData("creds.json", { strict: true })) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(ids.map(async (id) => {
            let value = await readData(`${type}-${id}.json`);
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }));
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}.json`;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => writeData("creds.json", creds)
  };
}

module.exports = { useMysqlAuthState, readMysqlConfig, createMysqlPool };

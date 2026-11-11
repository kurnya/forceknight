const test = require("node:test");
const assert = require("node:assert/strict");
const { useMysqlAuthState, readMysqlConfig } = require("../src/services/mysqlAuthState");

// Pool MySQL palsu di memori. Hanya mengenali 4 jenis perintah yang dipakai modul.
function fakePool() {
  const rows = new Map(); // "sesi|kunci" -> value
  const pool = {
    rows,
    sql: [],
    fail: false,
    insertDelays: [], // jeda (ms) untuk INSERT berurutan, untuk menguji urutan tulis
    async execute(sql, params = []) {
      pool.sql.push(sql.trim().split(/\s+/).slice(0, 2).join(" ").toUpperCase());
      if (pool.fail) throw new Error("connect ECONNREFUSED");
      const s = sql.trim().toUpperCase();
      if (s.startsWith("CREATE TABLE")) return [[], []];
      if (s.startsWith("SELECT")) {
        const v = rows.get(`${params[0]}|${params[1]}`);
        return [v === undefined ? [] : [{ value: v }], []];
      }
      if (s.startsWith("INSERT")) {
        const delay = pool.insertDelays.shift();
        if (delay) await new Promise((r) => setTimeout(r, delay));
        rows.set(`${params[0]}|${params[1]}`, params[2]);
        return [{ affectedRows: 1 }, []];
      }
      if (s.startsWith("DELETE")) {
        rows.delete(`${params[0]}|${params[1]}`);
        return [{ affectedRows: 1 }, []];
      }
      throw new Error("SQL tidak dikenal: " + sql);
    }
  };
  return pool;
}

const abu = (...n) => Buffer.from(n);

test("DB kosong: membuat creds baru; saveCreds menyimpan dan start berikutnya memuat creds yang sama", async () => {
  const pool = fakePool();
  const a = await useMysqlAuthState({ pool, sessionName: "s1" });
  assert.ok(a.state.creds.noiseKey, "creds baru punya noiseKey");
  await a.saveCreds();
  const b = await useMysqlAuthState({ pool, sessionName: "s1" });
  assert.deepEqual(Buffer.from(b.state.creds.noiseKey.private), Buffer.from(a.state.creds.noiseKey.private));
  assert.ok(Buffer.isBuffer(b.state.creds.noiseKey.private) || b.state.creds.noiseKey.private instanceof Uint8Array);
});

test("tabel dibuat saat start (CREATE TABLE IF NOT EXISTS)", async () => {
  const pool = fakePool();
  await useMysqlAuthState({ pool, sessionName: "s1" });
  assert.ok(pool.sql.includes("CREATE TABLE"));
});

test("keys.set lalu keys.get: Buffer kembali utuh; id yang tidak ada → null", async () => {
  const pool = fakePool();
  const { state } = await useMysqlAuthState({ pool, sessionName: "s1" });
  await state.keys.set({ "pre-key": { 1: { public: abu(1, 2, 3), private: abu(4, 5) } } });
  const got = await state.keys.get("pre-key", ["1", "2"]);
  assert.deepEqual(Buffer.from(got["1"].public), abu(1, 2, 3));
  assert.deepEqual(Buffer.from(got["1"].private), abu(4, 5));
  assert.equal(got["2"], null);
});

test("keys.set dengan nilai null menghapus kunci", async () => {
  const pool = fakePool();
  const { state } = await useMysqlAuthState({ pool, sessionName: "s1" });
  await state.keys.set({ session: { "x:1": { a: 1 } } });
  assert.notEqual((await state.keys.get("session", ["x:1"]))["x:1"], null);
  await state.keys.set({ session: { "x:1": null } });
  assert.equal((await state.keys.get("session", ["x:1"]))["x:1"], null);
});

test("app-state-sync-key diubah ke objek proto saat dibaca", async () => {
  const pool = fakePool();
  const { state } = await useMysqlAuthState({ pool, sessionName: "s1" });
  await state.keys.set({ "app-state-sync-key": { AAA: { keyData: abu(9, 8, 7) } } });
  const got = await state.keys.get("app-state-sync-key", ["AAA"]);
  assert.deepEqual(Buffer.from(got.AAA.keyData), abu(9, 8, 7));
});

test("dua nama sesi terpisah tidak saling melihat", async () => {
  const pool = fakePool();
  const a = await useMysqlAuthState({ pool, sessionName: "a" });
  const b = await useMysqlAuthState({ pool, sessionName: "b" });
  await a.state.keys.set({ "pre-key": { 1: { v: 1 } } });
  assert.equal((await b.state.keys.get("pre-key", ["1"]))["1"], null);
});

test("DB tidak terjangkau saat start: ditolak dan TIDAK membuat atau menulis sesi baru", async () => {
  const pool = fakePool();
  pool.fail = true;
  await assert.rejects(useMysqlAuthState({ pool, sessionName: "s1" }), /MySQL/i);
  assert.equal(pool.rows.size, 0);
  assert.ok(!pool.sql.includes("INSERT"));
});

test("creds di DB rusak (bukan JSON): ditolak dengan pesan jelas, tidak ditimpa", async () => {
  const pool = fakePool();
  pool.rows.set("s1|creds.json", "{bukan json");
  await assert.rejects(useMysqlAuthState({ pool, sessionName: "s1" }), /rusak/i);
  assert.equal(pool.rows.get("s1|creds.json"), "{bukan json");
  assert.ok(!pool.sql.includes("INSERT"));
});

test("kunci non-creds yang rusak dibaca sebagai null (seperti versi berkas)", async () => {
  const pool = fakePool();
  const { state } = await useMysqlAuthState({ pool, sessionName: "s1" });
  pool.rows.set("s1|pre-key-7.json", "{rusak");
  assert.equal((await state.keys.get("pre-key", ["7"]))["7"], null);
});

test("galat DB saat keys.get dilempar, bukan diam-diam jadi null", async () => {
  const pool = fakePool();
  const { state } = await useMysqlAuthState({ pool, sessionName: "s1" });
  pool.fail = true;
  await assert.rejects(state.keys.get("pre-key", ["1"]), /MySQL/i);
});

test("dua tulis cepat ke kunci yang sama: yang terakhir diminta yang menang", async () => {
  const pool = fakePool();
  const { state } = await useMysqlAuthState({ pool, sessionName: "s1" });
  pool.insertDelays = [30, 0]; // tulis pertama sengaja lebih lambat
  const p1 = state.keys.set({ "pre-key": { 1: { v: "lama" } } });
  const p2 = state.keys.set({ "pre-key": { 1: { v: "baru" } } });
  await Promise.all([p1, p2]);
  assert.equal((await state.keys.get("pre-key", ["1"]))["1"].v, "baru");
});

// ---- readMysqlConfig ----
const penuh = { AUTH_MYSQL_HOST: "localhost", AUTH_MYSQL_USER: "u", AUTH_MYSQL_PASSWORD: "p", AUTH_MYSQL_DATABASE: "d" };

test("readMysqlConfig: host kosong atau tidak ada → null (mode berkas)", () => {
  assert.equal(readMysqlConfig({}), null);
  assert.equal(readMysqlConfig({ AUTH_MYSQL_HOST: "  " }), null);
});

test("readMysqlConfig: lengkap → konfigurasi dengan default port 3306 dan sesi 'fuuka'", () => {
  assert.deepEqual(readMysqlConfig(penuh), { host: "localhost", port: 3306, user: "u", password: "p", database: "d", session: "fuuka" });
});

test("readMysqlConfig: port dan sesi kustom", () => {
  const c = readMysqlConfig({ ...penuh, AUTH_MYSQL_PORT: "3307", AUTH_MYSQL_SESSION: "bot2" });
  assert.equal(c.port, 3307);
  assert.equal(c.session, "bot2");
});

test("readMysqlConfig: host diisi tapi variabel lain kurang → galat menyebut nama variabelnya", () => {
  assert.throws(() => readMysqlConfig({ ...penuh, AUTH_MYSQL_USER: "" }), /AUTH_MYSQL_USER/);
  assert.throws(() => readMysqlConfig({ ...penuh, AUTH_MYSQL_PASSWORD: "" }), /AUTH_MYSQL_PASSWORD/);
  assert.throws(() => readMysqlConfig({ ...penuh, AUTH_MYSQL_DATABASE: "" }), /AUTH_MYSQL_DATABASE/);
});

test("readMysqlConfig: port bukan angka → galat", () => {
  assert.throws(() => readMysqlConfig({ ...penuh, AUTH_MYSQL_PORT: "abc" }), /AUTH_MYSQL_PORT/);
});

test("readMysqlConfig: nama sesi tidak valid (karakter aneh) → galat", () => {
  assert.throws(() => readMysqlConfig({ ...penuh, AUTH_MYSQL_SESSION: "a b;--" }), /AUTH_MYSQL_SESSION/);
});

// ---- observabilitas: galat DB harus kelihatan di log, bukan hilang di logger Baileys yang silent ----
test("galat tulis dicatat ke logger beserta nama kunci dan pesan galat", async () => {
  const pool = fakePool();
  const logs = [];
  const { state } = await useMysqlAuthState({ pool, sessionName: "s1", logger: { error: (...a) => logs.push(a.join(" ")) } });
  pool.fail = true;
  await assert.rejects(state.keys.set({ "pre-key": { 1: { v: 1 } } }), /MySQL/i);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /\[AUTH MYSQL\]/);
  assert.match(logs[0], /pre-key-1\.json/);
  assert.match(logs[0], /ECONNREFUSED/);
});

test("galat baca dan hapus juga dicatat ke logger", async () => {
  const pool = fakePool();
  const logs = [];
  const { state } = await useMysqlAuthState({ pool, sessionName: "s1", logger: { error: (...a) => logs.push(a.join(" ")) } });
  pool.fail = true;
  await assert.rejects(state.keys.get("pre-key", ["7"]), /MySQL/i);
  await assert.rejects(state.keys.set({ "pre-key": { 7: null } }), /MySQL/i);
  assert.equal(logs.length, 2);
  assert.match(logs[0], /pre-key-7\.json/);
  assert.match(logs[1], /pre-key-7\.json/);
});

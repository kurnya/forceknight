const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMasterData } = require("../src/services/masterData");

const URL_API = "https://example.test/exec";
const ROWS = [{ urutan: 1, nama: "Max HP", kode: "1180755" }];

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "masterdata-"));
}

function responOk(data) {
  return { ok: true, json: async () => ({ ok: true, data }) };
}

// fetch palsu yang menjawab berurutan dan mencatat panggilan.
function fakeFetch(...jawaban) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    const j = jawaban[Math.min(calls.length - 1, jawaban.length - 1)];
    if (typeof j === "function") return j(opts);
    if (j instanceof Error) throw j;
    return j;
  };
  fn.calls = calls;
  return fn;
}

function buat(opts = {}) {
  const t = { now: 1_000_000 };
  const cacheDir = opts.cacheDir || tmpDir();
  const md = createMasterData({ url: URL_API, cacheDir, now: () => t.now, timeoutMs: 50, ...opts });
  return { md, t, cacheDir };
}

test("berhasil: mengembalikan data dan menulis salinan disk", async () => {
  const f = fakeFetch(responOk(ROWS));
  const { md, cacheDir } = buat({ fetchImpl: f });
  assert.deepEqual(await md.getTab("buff"), ROWS);
  assert.equal(f.calls[0].url, `${URL_API}?action=read&tab=buff`);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(cacheDir, "buff.json"), "utf8")), ROWS);
});

test("cache segar: tidak fetch lagi dalam 5 menit", async () => {
  const f = fakeFetch(responOk(ROWS));
  const { md, t } = buat({ fetchImpl: f });
  await md.getTab("buff");
  t.now += 4 * 60 * 1000;
  await md.getTab("buff");
  assert.equal(f.calls.length, 1);
});

test("cache kedaluwarsa: fetch ulang dan memakai data baru", async () => {
  const baru = [{ urutan: 1, nama: "ATK", kode: "5" }];
  const f = fakeFetch(responOk(ROWS), responOk(baru));
  const { md, t } = buat({ fetchImpl: f });
  await md.getTab("buff");
  t.now += 5 * 60 * 1000 + 1;
  assert.deepEqual(await md.getTab("buff"), baru);
  assert.equal(f.calls.length, 2);
});

test("fetch gagal setelah pernah berhasil: pakai cache memori kedaluwarsa", async () => {
  const f = fakeFetch(responOk(ROWS), new Error("jaringan putus"));
  const { md, t } = buat({ fetchImpl: f });
  await md.getTab("buff");
  t.now += 10 * 60 * 1000;
  assert.deepEqual(await md.getTab("buff"), ROWS);
});

test("fetch gagal, memori kosong, ada salinan disk: pakai salinan disk", async () => {
  const cacheDir = tmpDir();
  fs.writeFileSync(path.join(cacheDir, "buff.json"), JSON.stringify(ROWS));
  const { md } = buat({ cacheDir, fetchImpl: fakeFetch(new Error("mati")) });
  assert.deepEqual(await md.getTab("buff"), ROWS);
});

test("semua gagal: null", async () => {
  const { md } = buat({ fetchImpl: fakeFetch(new Error("mati")) });
  assert.equal(await md.getTab("buff"), null);
});

test("respons bukan JSON (halaman HTML) → pakai cadangan, tidak melempar", async () => {
  const html = { ok: true, json: async () => { throw new SyntaxError("Unexpected token <"); } };
  const cacheDir = tmpDir();
  fs.writeFileSync(path.join(cacheDir, "buff.json"), JSON.stringify(ROWS));
  const { md } = buat({ cacheDir, fetchImpl: fakeFetch(html) });
  assert.deepEqual(await md.getTab("buff"), ROWS);
});

test("respons ok:false atau data bukan array → cadangan", async () => {
  const gagal = { ok: true, json: async () => ({ ok: false, error: "x" }) };
  const bukanArray = { ok: true, json: async () => ({ ok: true, data: { a: 1 } }) };
  const { md } = buat({ fetchImpl: fakeFetch(gagal) });
  assert.equal(await md.getTab("buff"), null);
  const { md: md2 } = buat({ fetchImpl: fakeFetch(bukanArray) });
  assert.equal(await md2.getTab("buff"), null);
});

test("HTTP bukan 2xx → cadangan", async () => {
  const { md } = buat({ fetchImpl: fakeFetch({ ok: false, status: 500, json: async () => ({}) }) });
  assert.equal(await md.getTab("buff"), null);
});

test("timeout: fetch yang menggantung diputus sesuai timeoutMs", async () => {
  const menggantung = (opts) =>
    new Promise((_, reject) => opts.signal.addEventListener("abort", () => reject(new Error("aborted"))));
  const { md } = buat({ fetchImpl: fakeFetch(menggantung), timeoutMs: 20 });
  const mulai = Date.now();
  assert.equal(await md.getTab("buff"), null);
  assert.ok(Date.now() - mulai < 1000, "tidak menunggu selamanya");
});

test("url kosong: null tanpa fetch", async () => {
  const f = fakeFetch(responOk(ROWS));
  const { md } = buat({ url: "", fetchImpl: f });
  assert.equal(await md.getTab("buff"), null);
  assert.equal(f.calls.length, 0);
});

test("nama tab aneh tidak dipakai sebagai path berkas (tidak menulis di luar cacheDir)", async () => {
  const f = fakeFetch(responOk(ROWS));
  const { md, cacheDir } = buat({ fetchImpl: f });
  await md.getTab("../../evil");
  assert.equal(fs.existsSync(path.join(cacheDir, "..", "..", "evil.json")), false);
  assert.deepEqual(fs.readdirSync(cacheDir), []);
});

test("gagal menulis salinan disk tidak mengubah hasil", async () => {
  const f = fakeFetch(responOk(ROWS));
  const berkas = path.join(tmpDir(), "bukan-folder");
  fs.writeFileSync(berkas, "x"); // cacheDir menunjuk ke berkas, mkdir akan gagal
  const { md } = buat({ fetchImpl: f, cacheDir: berkas });
  assert.deepEqual(await md.getTab("buff"), ROWS);
});

# Master Data Buff (#3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isi topik `#3` (Kode Buff) diambil dari Google Sheet "Master Data Fuuka" dan bisa diubah lewat dashboard ber-PIN.

**Architecture:** Apps Script Web App jadi satu-satunya akses ke Sheet. Bot membaca lewat aksi `read` publik (cache + salinan disk + string statis sebagai cadangan). Dashboard statis di GitHub Pages memakai aksi ber-PIN. Bot dan dashboard memakai penyusun teks yang sama isinya.

**Tech Stack:** Node.js >= 20.9 (CommonJS, `node --test`), Google Apps Script, HTML/JS statis tanpa build.

**Spec:** [docs/superpowers/specs/2026-11-08-master-data-buff-design.md](../specs/2026-11-08-master-data-buff-design.md)

## Global Constraints

- **Jangan commit.** Pengguna yang commit. Tidak ada langkah `git commit` di rencana ini.
- **Jangan menyentuh `D:\01Projek\DEV\SISKOWAL`.** Itu projek lain, hanya contoh gaya.
- Dashboard ada di projek baru `D:\01Projek\DEV\fuuka-dashboard`, terpisah dari bot.
- Tab yang diizinkan: `ALLOWED_TABS = ["buff", "buffland"]`.
- Respons API: `{ ok: true, data }` atau `{ ok: false, error }`.
- PIN di Script Properties `DASHBOARD_PIN`, bukan di Sheet. 5 salah berturut-turut, kunci 10 menit.
- Cache bot 5 menit, timeout fetch 5 detik, salinan disk di `src/data/cache/<tab>.json` (masuk `.gitignore`).
- `MASTER_DATA_URL` kosong berarti perilaku lama (string statis di `help.js`).
- `topicReplies["#3"]` harus tetap ada sebagai string (dicek di `messageHandler.js:222`).
- Teks dan komentar memakai Bahasa Indonesia, gaya yang sama dengan kode yang ada.

## Review Focus

- Sheet kosong atau tab tanpa baris: bot memakai cadangan berikutnya, tidak mengirim pesan kosong.
- `kode` berisi spasi, huruf, atau sel numerik dari Sheet (angka tanpa tanda kutip): perlakukan sebagai string angka, tolak sisanya saat simpan.
- Baris `nama` sama tapi tidak berurutan: tetap tampil sebagai kelompok terpisah sesuai `urutan`, tidak digabung diam-diam.
- Dua penyimpanan bersamaan: yang kedua menunggu kunci atau ditolak, tidak ada data setengah tertulis.
- Respons Apps Script bukan JSON (halaman galat HTML Google): bot jatuh ke cadangan, dashboard menampilkan pesan jelas.

---

## File Structure

**`D:\01Projek\DEV\fuuka-dashboard` (repo baru)**
- `apps-script/Logic.gs`: fungsi murni (parse, validasi, PIN, kunci percobaan). Tanpa `SpreadsheetApp`.
- `apps-script/Code.gs`: `doGet`, `doPost`, `setup`, akses Sheet, `LockService`.
- `tests/logic.test.js`, `tests/code.test.js`, `tests/fake-sheets.js`: tes Node. `Logic.gs` dan `Code.gs` dimuat apa adanya lewat `vm`.
- `lib/buffText.js`: penyusun teks (`UMD`, jalan di browser dan Node). Disalin ke bot dan dijaga sama lewat kasus uji bersama.
- `index.html`, `app.js`, `api.js`, `styles.css`, `config.js`: dashboard.
- `tests/api.test.js`, `tests/bufftext.test.js`.
- `README.md`: langkah setup.

**`ForceknightBot` (repo ini)**
- Create `src/services/buffText.js`: salinan `lib/buffText.js` (CommonJS).
- Create `src/services/masterData.js`: ambil, cache, salinan disk.
- Modify `src/commands/help.js`: cabang `#3` di `execute` (sekitar baris 2124).
- Modify `.env.example`, `.gitignore`, `package.json` (skrip `test`).
- Create `tests/buffText.test.js`, `tests/masterData.test.js`, `tests/fixtures/buff-cases.json` (kasus uji bersama).

---

### Task 1: Logika murni Apps Script

**Files:**
- Create: `D:\01Projek\DEV\fuuka-dashboard\apps-script\Logic.gs`
- Create: `D:\01Projek\DEV\fuuka-dashboard\package.json` (`{"scripts":{"test":"node --test tests/*.test.js"}}`)
- Test: `D:\01Projek\DEV\fuuka-dashboard\tests\logic.test.js`

**Interfaces:**
- Produces (global di scope Apps Script, dimuat tes lewat `vm`):
  - `TAB_SCHEMAS`: `{ buff: ["urutan","nama","kode"], buffland: ["urutan","label","nama"] }`
  - `isAllowedTab(tab: string): boolean`
  - `parseRows(tab: string, values: any[][]): object[]`: `values[0]` header; abaikan baris yang seluruh selnya kosong; `urutan` jadi number; `kode` jadi string (angka dari Sheet dikonversi, tanpa `.0`); hasil diurutkan menurut `urutan` stabil.
  - `validateRows(tab: string, rows: object[]): string | null`: pesan galat Indonesia atau `null` bila valid.
  - `rowsToValues(tab: string, rows: object[]): any[][]`: header + baris, `urutan` diberi nomor ulang 1..n sesuai urutan array.
  - `checkPin(input: string, expected: string): boolean`: perbandingan waktu-konstan; `false` bila `expected` kosong.
  - `lockState(attempts: number, nowMs: number, lockedUntilMs: number): { locked: boolean, retryInSec: number }`
  - `nextAttempts(attempts: number, success: boolean): number`: sukses reset ke 0, gagal +1. Konstanta `MAX_PERCOBAAN = 5`, `KUNCI_DETIK = 600`.

- [ ] **Step 1: Tulis tes gagal** di `tests/logic.test.js`. Muat `Logic.gs` dengan `vm.runInNewContext(fs.readFileSync(...))`. Tes (nama dan inti assert):
  - `parseRows buff: urutkan menurut urutan dan kode jadi string` — input `[["urutan","nama","kode"],[2,"ATK",5130123],[1,"Max HP","1180755"]]` → `[{urutan:1,nama:"Max HP",kode:"1180755"},{urutan:2,nama:"ATK",kode:"5130123"}]`.
  - `parseRows: baris kosong diabaikan`.
  - `validateRows buff: nama kosong ditolak`, `kode huruf ditolak`, `kode kosong ditolak`, `urutan bukan bilangan bulat ditolak`, `valid mengembalikan null`.
  - `validateRows buffland: label atau nama kosong ditolak`.
  - `validateRows: tab tidak dikenal ditolak`.
  - `rowsToValues: nomor urutan dihitung ulang 1..n`.
  - `checkPin: benar, salah, panjang beda, expected kosong → false`.
  - `lockState: 4 gagal belum terkunci, 5 gagal terkunci dengan retryInSec > 0, setelah lockedUntil lewat tidak terkunci`.
  - `nextAttempts: gagal +1, sukses reset 0`.
- [ ] **Step 2: Jalankan, pastikan gagal.** Run: `cd D:\01Projek\DEV\fuuka-dashboard && node --test tests/logic.test.js`. Expected: FAIL (fungsi belum ada).
- [ ] **Step 3: Implementasikan** fungsi di atas di `apps-script/Logic.gs` dengan sintaks `var` + `function` (kompatibel Apps Script, tanpa `import`/`export`). `checkPin` membandingkan semua karakter tanpa keluar awal.
- [ ] **Step 4: Jalankan lagi.** Expected: PASS semua.

---

### Task 2: Web App Apps Script (`Code.gs`) dengan Sheet tiruan

**Files:**
- Create: `apps-script/Code.gs`
- Create: `tests/fake-sheets.js`
- Test: `tests/code.test.js`

**Interfaces:**
- Consumes: semua fungsi `Logic.gs` dari Task 1.
- Produces (scope global Apps Script):
  - `setup(): void`: buat tab `buff` dan `buffland` bila belum ada, isi data awal hanya jika tab kosong (seed = isi `#3` saat ini: semua 22 baris buff, termasuk kode DTE ganda, dan 4 baris buffland dari [help.js:719-819](../../src/commands/help.js#L719)). Tidak menimpa isi yang sudah ada.
  - `doGet(e)`: aksi `read` dengan `e.parameter.tab`.
  - `doPost(e)`: body JSON (`Content-Type: text/plain`), aksi `login`, `read_admin`, `save`.
  - Semua mengembalikan `ContentService` JSON `{ok,data|error}`.
- `tests/fake-sheets.js` menyediakan `buatLingkungan()` → `{ ctx, sheets, props, cache }`: tiruan `SpreadsheetApp`, `PropertiesService`, `CacheService`, `LockService`, `ContentService`; `ctx` adalah hasil `vm` dari `Logic.gs`+`Code.gs`.

- [ ] **Step 1: Tulis tes gagal** di `tests/code.test.js`:
  - `setup() membuat tab dan seed, dijalankan ulang tidak menimpa` — ubah satu sel, jalankan `setup()` lagi, sel tetap.
  - `GET read buff mengembalikan baris terurut tanpa PIN`.
  - `GET read tab tidak dikenal → ok:false`.
  - `POST login: PIN benar ok:true, PIN salah ok:false`.
  - `read_admin tanpa PIN benar → ok:false`.
  - `save: baris valid menulis ulang tab dan read berikutnya cocok`.
  - `save: satu baris tidak valid menolak seluruh tab, isi Sheet tidak berubah`.
  - `5 PIN salah berturut-turut mengunci; PIN benar saat terkunci tetap ditolak dengan pesan tunggu`.
  - `body bukan JSON → ok:false, bukan exception`.
  - `lock gagal diperoleh → ok:false "Sedang ada penyimpanan lain"` (fake `LockService.tryLock` mengembalikan `false`).
- [ ] **Step 2: Jalankan, pastikan gagal.** Run: `node --test tests/code.test.js`. Expected: FAIL.
- [ ] **Step 3: Implementasikan `Code.gs`.** `save` memakai `LockService.getScriptLock().tryLock(10000)`, memvalidasi dengan `validateRows`, lalu `sheet.clearContents()` dan satu `setValues` dari `rowsToValues`. Penghitung percobaan di `CacheService.getScriptCache()` (kunci `pin_attempts`, `pin_locked_until`), TTL 600 detik. Aksi ber-PIN selalu cek `lockState` dulu.
- [ ] **Step 4: Jalankan lagi.** Expected: PASS.

---

### Task 3: Penyusun teks `#3` (bot dan dashboard sama)

**Files:**
- Create: `D:\01Projek\DEV\ForceknightBot\tests\fixtures\buff-cases.json`
- Create: `D:\01Projek\DEV\ForceknightBot\src\services\buffText.js`
- Test: `D:\01Projek\DEV\ForceknightBot\tests\buffText.test.js`
- Modify: `D:\01Projek\DEV\ForceknightBot\package.json` (tambah skrip `"test": "node --test tests/*.test.js"`)
- Create (di Task 6): `fuuka-dashboard\lib\buffText.js` dan `tests\bufftext.test.js` memakai berkas fixture yang sama.

**Interfaces:**
- Produces: `buildBuffBody(buffRows: {urutan:number,nama:string,kode:string}[], bufflandRows: {urutan:number,label:string,nama:string}[]): string`. Mengembalikan isi dari baris judul `Kode Buff Player Toram` sampai blok buffland, **persis** format string `#3` sekarang: divider, judul, divider, baris kosong, `*List Buff*`, lalu tiap kelompok `nama` diikuti kodenya satu per baris dan baris kosong; `*Code buffland member/admin*`, baris kosong, `label` rata-kiri dengan lebar 11 diikuti `: nama` (contoh `MP         : punkz`); divider di akhir. Pengelompokan: baris berurutan dengan `nama` sama masuk satu kelompok; urutan memakai `urutan` (stabil).
  - `divider` memakai karakter yang sama dengan `help.js` (`━` x 20, lihat `divider` di `help.js`).
- Fixture `buff-cases.json`: array `{ nama, buff, buffland, expected }`. Kasus wajib: (1) seed lengkap `#3` sekarang, `expected` = isi `topicReplies["#3"]` yang ada; (2) satu buff satu kode; (3) nama sama tidak berurutan → dua kelompok terpisah; (4) buffland kosong → blok buffland dihilangkan; (5) buff kosong → hanya judul dan buffland.

- [ ] **Step 1: Tulis tes gagal** `tests/buffText.test.js`: untuk setiap kasus di fixture, `assert.equal(buildBuffBody(c.buff, c.buffland), c.expected)`. Isi `expected` kasus (1) dengan menyalin string `#3` dari `help.js` apa adanya (baris-baris dari `divider` sampai `divider` terakhir, digabung `\n`).
- [ ] **Step 2: Jalankan, pastikan gagal.** Run: `npm test`. Expected: FAIL (modul belum ada).
- [ ] **Step 3: Implementasikan `buildBuffBody`** di `src/services/buffText.js` (CommonJS, ekspor `{ buildBuffBody }`). Tanpa I/O.
- [ ] **Step 4: Jalankan lagi.** Expected: PASS semua kasus, termasuk kesamaan persis dengan string `#3` lama.

---

### Task 4: Service `masterData.js` (fetch, cache, salinan disk)

**Files:**
- Create: `src/services/masterData.js`
- Test: `tests/masterData.test.js`
- Modify: `.gitignore` (tambah `src/data/cache/`)

**Interfaces:**
- Produces: `createMasterData(options?: { url?: string, fetchImpl?: typeof fetch, now?: () => number, cacheDir?: string, ttlMs?: number, timeoutMs?: number }): { getTab(tab: string): Promise<object[] | null> }` dan `module.exports.getTab` memakai instance bawaan (`url = process.env.MASTER_DATA_URL`, `ttlMs = 300000`, `timeoutMs = 5000`, `cacheDir = src/data/cache`).
- Perilaku `getTab`: tanpa `url` → `null`. Cache memori masih segar → kembalikan tanpa fetch. Fetch ke `${url}?action=read&tab=${tab}` dengan `AbortController`. Respons harus `ok:true` dan `data` array; hasil berhasil disimpan ke memori dan ke `<cacheDir>/<tab>.json`. Gagal apa pun (jaringan, timeout, bukan JSON, `ok:false`, bukan array) → cache memori kedaluwarsa, lalu salinan disk, lalu `null`. Tidak pernah melempar.

- [ ] **Step 1: Tulis tes gagal** (fetch palsu, `cacheDir` = folder temp dari `fs.mkdtempSync`, `now` dikendalikan):
  - `berhasil: mengembalikan data dan menulis salinan disk`
  - `cache segar: tidak fetch lagi dalam 5 menit`
  - `cache kedaluwarsa: fetch ulang`
  - `fetch gagal setelah pernah berhasil: pakai cache memori kedaluwarsa`
  - `fetch gagal, memori kosong, ada salinan disk: pakai salinan disk`
  - `semua gagal: null`
  - `respons bukan JSON (HTML) → pakai cadangan, tidak melempar`
  - `respons ok:false → pakai cadangan`
  - `timeout: fetch yang menggantung diputus sesuai timeoutMs` (fetch palsu menunggu sampai `signal` abort)
  - `url kosong: null tanpa fetch`
- [ ] **Step 2: Jalankan, pastikan gagal.** Run: `node --test tests/masterData.test.js`. Expected: FAIL.
- [ ] **Step 3: Implementasikan** memakai `fetch` global Node 20, `fs.promises`. Buat `cacheDir` bila belum ada (`mkdir recursive`). Kegagalan menulis disk hanya dicatat dengan `console.warn`, tidak mengubah hasil.
- [ ] **Step 4: Jalankan lagi.** Expected: PASS.

---

### Task 5: Sambungkan `#3` di `help.js` dan konfigurasi

**Files:**
- Modify: `src/commands/help.js` (tambah `require` di atas; ubah cabang `#3` pada `execute`, saat ini `help.js:2124-2125`; tambah fungsi `buildBuffTopicText`)
- Modify: `.env.example` (tambah `# MASTER_DATA_URL=https://script.google.com/macros/s/.../exec` dengan komentar singkat)
- Test: `tests/helpBuff.test.js`

**Interfaces:**
- Consumes: `getTab` (Task 4), `buildBuffBody` (Task 3).
- Produces (diekspor dari `help.js` untuk tes): `buildBuffTopicText(deps?: { getTab?: (tab: string) => Promise<object[] | null> }): Promise<string>`. Bila `buff` tersedia dan tidak kosong → `buildBuffBody(buff, buffland ?? [])`. Bila `buff` `null` atau kosong → `topicReplies["#3"]` (string statis). Tidak pernah melempar.
- Perubahan `execute`: untuk `#3`, `topicReply = await buildBuffTopicText()` sebelum `formatTopicMessage(topicReply, "buff")`. `topicReplies["#3"]` tidak dihapus.

- [ ] **Step 1: Tulis tes gagal:**
  - `buildBuffTopicText: data Sheet tersedia → teks dari data`
  - `buff null → string statis topicReplies["#3"]`
  - `buff array kosong → string statis` (Review Focus: Sheet kosong)
  - `buffland null tapi buff ada → teks tanpa blok buffland, tetap tidak kosong`
  - `getTab melempar → string statis`
  - `topicReplies["#3"] tetap string berisi "Kode Buff Player Toram"` (menjaga `messageHandler`)
- [ ] **Step 2: Jalankan, pastikan gagal.** Run: `node --test tests/helpBuff.test.js`. Expected: FAIL.
- [ ] **Step 3: Implementasikan** perubahan di atas. Mengimpor `help.js` di tes tidak boleh menyalakan bot; bila modul punya efek samping saat di-`require`, isi `process.env` seperlunya di tes dan catat temuan untuk pengguna.
- [ ] **Step 4: Jalankan semuanya.** Run: `npm test`. Expected: PASS. Lalu `node -e "require('./src/commands/help')"` tanpa galat.

---

### Task 6: Dashboard: klien API dan penyusun teks

**Files:**
- Create: `D:\01Projek\DEV\fuuka-dashboard\api.js`, `lib\buffText.js`, `config.js`
- Test: `tests\api.test.js`, `tests\bufftext.test.js`

**Interfaces:**
- `lib/buffText.js`: UMD (`window.FuukaBuffText` di browser, `module.exports` di Node), isi sama dengan `src/services/buffText.js` Task 3. `tests/bufftext.test.js` memuat `buff-cases.json` yang disalin dari bot (`tests/fixtures/buff-cases.json`) dan harus lulus dengan kasus yang sama.
- `api.js` (UMD, `createApi({ getUrl: () => string, fetchImpl: typeof fetch })`): `login(pin): Promise<true>`, `readAdmin(tab, pin): Promise<object[]>`, `save(tab, rows, pin): Promise<true>`. Semua `POST` dengan header `Content-Type: text/plain;charset=utf-8` (hindari preflight CORS) dan body `JSON.stringify({action, pin, tab, rows})`. `ok:false` → lempar `Error(payload.error)`. Respons bukan JSON → `Error("Server tidak bisa dijangkau (respons bukan JSON)")`. `save` tanpa retry. `config.js` berisi `window.FUUKA_CONFIG = { API_URL: "" }`.

- [ ] **Step 1: Tulis tes gagal:** `login sukses`, `login PIN salah melempar pesan server`, `respons HTML melempar pesan jelas`, `save mengirim action:"save" dengan PIN dan rows`, `save gagal tidak diulang (fetch dipanggil sekali)`, serta tes `bufftext` dari fixture.
- [ ] **Step 2: Jalankan, pastikan gagal.** Run: `cd D:\01Projek\DEV\fuuka-dashboard && npm test`. Expected: FAIL.
- [ ] **Step 3: Implementasikan** `api.js` dan salin `buffText` (isi identik, bungkus UMD).
- [ ] **Step 4: Jalankan lagi.** Expected: PASS.

---

### Task 7: Dashboard: layar PIN, editor, preview

**Files:**
- Create: `index.html`, `app.js`, `styles.css`
- Test: manual (tidak ada kerangka UI; logika yang bisa dites sudah di Task 6)

**Interfaces:**
- Consumes: `FuukaApi` (Task 6), `FuukaBuffText.buildBuffBody`.
- Perilaku:
  - Layar PIN: input PIN, tombol Masuk → `login`. Sukses: simpan PIN di `sessionStorage` (bungkus try/catch), tampilkan editor. Gagal: tampilkan pesan server (termasuk pesan terkunci).
  - Tab `Kode Buff` dan `Code Buffland` (daftar tab dibuat dari satu array konfigurasi, tab baru tinggal ditambah).
  - Editor `buff`: tabel `nama` + `kode`; tambah nama, tambah kode pada nama itu, hapus baris, geser naik/turun. `kode` hanya menerima angka (filter input) dan ditolak saat simpan bila tidak valid. Editor `buffland`: tabel `label` + `nama`.
  - Preview: tampilkan `buildBuffBody(...)` dari data yang sedang diedit, font monospace, diperbarui saat mengetik.
  - Simpan: kirim seluruh tab, tampilkan "Tersimpan" atau pesan galat server. Tombol nonaktif saat mengirim (cegah klik ganda).
  - Tata letak jalan di lebar ponsel (gutter 16px, tanpa gulir horizontal), mendukung mode gelap lewat `prefers-color-scheme`.

- [ ] **Step 1: Bangun** `index.html`, `styles.css`, `app.js` sesuai perilaku di atas, memakai `api.js` dan `lib/buffText.js`.
- [ ] **Step 2: Uji manual dengan API palsu.** Buka `index.html` lewat server statis lokal (`npx serve .`) dengan `API_URL` mengarah ke Apps Script yang sudah di-deploy (Task 9) atau stub lokal. Periksa: PIN salah ditolak, preview berubah saat edit, `kode` huruf ditolak, simpan sukses dan galat tampil, layar 375px tanpa gulir horizontal.

---

### Task 8: README dan deploy

**Files:**
- Create: `D:\01Projek\DEV\fuuka-dashboard\README.md`
- Modify: `D:\01Projek\DEV\ForceknightBot\README.md` bila ada bagian konfigurasi `.env` (tambah `MASTER_DATA_URL`)

- [ ] **Step 1: Tulis README dashboard:** setup Sheet (buka "Master Data Fuuka" → Ekstensi → Apps Script, tempel `Logic.gs` dan `Code.gs`, jalankan `setup`, set Script Property `DASHBOARD_PIN`, Deploy → Web app, Execute as: Me, Access: Anyone, salin URL `/exec`), isi `config.js`, aktifkan GitHub Pages, serta catatan "versi deployment baru setiap `.gs` berubah".
- [ ] **Step 2: Tambahkan `MASTER_DATA_URL`** ke dokumentasi `.env` bot bila README bot memuat daftar variabel.

---

### Task 9: Uji alur penuh (manual, oleh pengguna dan agen)

- [ ] **Step 1:** Pengguna men-deploy Apps Script dan mengisi `API_URL` serta `MASTER_DATA_URL`. Agen tidak memiliki akses ke akun Google pengguna.
- [ ] **Step 2:** Buka dashboard, login dengan PIN, ubah satu kode di `Kode Buff`, Simpan.
- [ ] **Step 3:** Pastikan GET `…/exec?action=read&tab=buff` menampilkan nilai baru.
- [ ] **Step 4:** Restart bot atau tunggu 5 menit, kirim `!help #3` di grup uji. Expected: isi buff berubah, sapaan, intro, judul, divider, "Baca selengkapnya", dan footer tetap seperti sebelumnya.
- [ ] **Step 5:** Kosongkan `MASTER_DATA_URL`, restart, kirim `!help #3`. Expected: isi lama muncul (cadangan statis). Matikan akses jaringan ke Apps Script dengan URL salah dan pastikan salinan disk dipakai.

---

## Self-Review

- **Cakupan spec:** Sheet + seed (Task 2), API read/login/read_admin/save + validasi + kunci PIN + `LockService` (Task 1-2), service bot dengan cache/disk/timeout (Task 4), `help.js` + cadangan statis + `.env` (Task 5), penyusun teks sama di dua tempat (Task 3, 6), dashboard PIN/editor/preview (Task 6-7), README dan alur uji (Task 8-9). Perintah pembersih cache sengaja tidak dikerjakan (di spec: di luar cakupan).
- **Konsistensi nama:** `buildBuffBody`, `getTab`, `parseRows`, `validateRows`, `rowsToValues`, `checkPin`, `lockState`, `nextAttempts`, `ALLOWED_TABS`/`TAB_SCHEMAS`, `MASTER_DATA_URL` dipakai sama di semua task.
- **Review Focus:** Sheet kosong (Task 5), kode non-angka / numerik dari Sheet (Task 1), nama tidak berurutan (Task 3 kasus 3), simpan bersamaan (Task 2 tes lock), respons bukan JSON (Task 4 dan Task 6).
- **Tanpa commit:** tidak ada langkah commit di seluruh rencana.

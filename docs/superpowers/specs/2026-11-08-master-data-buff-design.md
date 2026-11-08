# Master Data Fuuka: Kode Buff (#3) dari Google Sheet

Tanggal: 2026-11-08
Status: menunggu review

## Tujuan

Isi daftar buff pada topik `#3` (Kode Buff Player Toram) tidak lagi ditulis di
kode bot. Isinya diambil dari Google Spreadsheet **Master Data Fuuka**, dan admin
mengubahnya lewat web dashboard terpisah. Tampilan pesan selain isi daftar
(sapaan, intro, judul, divider, "Baca selengkapnya", footer) tidak berubah.

Tahap ini hanya topik `#3`. Spreadsheet, API, dan service bot dibuat generik
(per tab) supaya topik lain bisa menyusul tanpa menulis ulang.

## Di luar cakupan

- Topik lain (#1, #2, #4 dst.). Mereka berisi teks bebas dan butuh editor lain.
- Login Google atau akun per pengguna. Aksesnya satu PIN bersama.
- Riwayat perubahan atau undo di dashboard. Pemulihan lewat *Version history*
  bawaan Google Sheets.

## Arsitektur

```
Dashboard (GitHub Pages, repo fuuka-dashboard)
        │  POST login/save (PIN)
        ▼
Apps Script Web App ◄── GET read (publik) ── Bot WA (ForceknightBot)
        │
Google Sheet "Master Data Fuuka"
```

Tiga bagian dan batasnya:

| Bagian | Repo | Tugas |
|---|---|---|
| Apps Script | `fuuka-dashboard/apps-script/` | Satu-satunya yang menyentuh Sheet. Cek PIN, validasi, baca, simpan. |
| Dashboard | `fuuka-dashboard` | Layar PIN, editor tabel, preview pesan WA. Hanya bicara dengan Apps Script. |
| Bot | `ForceknightBot` | Ambil JSON dari aksi `read`, cache, susun teks `#3`. |

Pola ini sama dengan SISKOWAL (`D:\01Projek\DEV\SISKOWAL`): web statis,
Apps Script Web App sebagai API, Sheet sebagai database.

## Spreadsheet

Satu spreadsheet, satu tab per topik. Baris pertama adalah header.

**Tab `buff`**: satu baris per kode.

| urutan | nama | kode |
|---|---|---|
| 1 | Max HP | 1180755 |
| 21 | DTE Bumi | 4111113 |
| 22 | DTE Bumi | 2210103 |

Baris dengan `nama` sama yang berurutan dikelompokkan, jadi bot mencetak nama
sekali lalu semua kodenya, sama seperti format sekarang.

**Tab `buffland`**: blok "Code buffland member/admin".

| urutan | label | nama |
|---|---|---|
| 1 | MP | punkz |
| 2 | AMPR | hsans, moung zy |

Data awal kedua tab diisi dari isi `#3` yang ada sekarang di
[help.js:719](../../../src/commands/help.js#L719).

**PIN tidak disimpan di Sheet.** PIN ada di *Script Properties* Apps Script
(`DASHBOARD_PIN`).

## Apps Script API

Satu Web App (Execute as: Me, Access: Anyone), dengan daftar tab yang diizinkan
(`ALLOWED_TABS = ["buff", "buffland"]`). Menambah topik berarti menambah tab,
skema kolomnya, dan aturan validasinya pada satu tabel konfigurasi.

| Aksi | Metode | PIN | Fungsi |
|---|---|---|---|
| `read` | `GET ?action=read&tab=buff` | tidak | Mengembalikan baris tab sebagai JSON. Dipakai bot. |
| `login` | `POST` | ya | Cek PIN. Dipakai layar PIN dashboard. |
| `read_admin` | `POST` | ya | Sama dengan `read`, untuk dashboard setelah login. |
| `save` | `POST` | ya | Validasi lalu mengganti seluruh isi tab. |

Aksi `read` publik sengaja: isi kode buff memang ditampilkan ke seluruh guild.
Dashboard memakai `read_admin` supaya tidak ada akses dashboard tanpa PIN.

Respons seragam seperti SISKOWAL: `{ ok: true, data }` atau
`{ ok: false, error }`.

**Validasi `buff`:** `nama` tidak boleh kosong, `kode` hanya angka, `urutan`
bilangan bulat. **Validasi `buffland`:** `label` dan `nama` tidak boleh kosong.
Tab ditolak seluruhnya bila ada satu baris tidak valid (tidak ada simpan
sebagian). Penyimpanan memakai `LockService` agar dua penyimpanan bersamaan
tidak saling menimpa.

**Pembatasan PIN:** 5 kali salah berturut-turut mengunci aksi ber-PIN selama 10
menit (penghitung di `CacheService`). PIN dibandingkan dengan perbandingan
waktu-konstan.

Catatan keamanan: Web App memakai Anyone, jadi URL `/exec` publik. Yang
melindungi data adalah PIN dan pembatasan di atas, bukan kerahasiaan URL.

## Bot (ForceknightBot)

**File baru `src/services/masterData.js`**
- `getTab(tab)` mengambil `MASTER_DATA_URL?action=read&tab=<tab>`.
- Timeout 5 detik. Hasil berhasil di-cache di memori 5 menit.
- Setiap hasil berhasil juga disalin ke `src/data/cache/<tab>.json`.
- Bila fetch gagal: pakai cache memori yang kedaluwarsa, lalu salinan disk, lalu
  `null`. Pemanggil yang menentukan cadangan terakhir.
- `src/data/cache/` masuk `.gitignore`.

**Perubahan `src/commands/help.js`**
- `topicReplies["#3"]` tetap ada sebagai string statis (isi lama). Ini penting:
  [messageHandler.js:222](../../../src/handlers/messageHandler.js#L222) hanya
  mengecek bahwa kuncinya ada, dan string ini jadi **cadangan terakhir** bila
  Sheet dan salinan disk sama-sama tidak ada.
- Fungsi `buildBuffTopicText()` (async) merakit isi `#3` dari data `buff` dan
  `buffland` dengan format yang sama seperti string sekarang.
- Pada `execute`, cabang `#3` memanggil `buildBuffTopicText()` dulu, lalu hasilnya
  masuk ke `formatTopicMessage(..., "buff")` seperti sebelumnya.
- Pemanggilan dari [fuuka.js:505](../../../src/commands/fuuka.js#L505) lewat
  `helpCommand.execute`, jadi ikut otomatis.

**Konfigurasi:** `MASTER_DATA_URL` di `.env` dan `.env.example`. Bila kosong,
bot langsung memakai string statis (perilaku lama), jadi bot tidak rusak sebelum
Apps Script dipasang.

**Penyusun teks** dipisah sebagai fungsi murni (`rows → string`) agar bisa dites
tanpa jaringan.

## Dashboard (repo baru `fuuka-dashboard`)

Statis murni, tanpa build: `index.html`, `app.js`, `api.js`, `styles.css`,
`config.js` (berisi `API_URL`). Repo ini juga memuat `apps-script/` dan
`README.md` berisi langkah setup, meniru SISKOWAL.

- **Layar PIN.** PIN dikirim ke `login`. Bila benar, PIN disimpan di
  `sessionStorage` (hilang saat tab ditutup) dan dikirim di tiap aksi ber-PIN.
- **Editor `buff`.** Tabel nama dan kode: tambah, hapus, geser urutan. Nama yang
  sama dikelompokkan di tampilan; tombol "tambah kode" menambah baris kode pada
  nama itu.
- **Editor `buffland`.** Tabel label dan nama.
- **Preview.** Menampilkan teks WA yang akan dilihat guild, dengan fungsi penyusun
  yang sama dengan bot (disalin dan dijaga sinkron lewat tes yang sama untuk
  kasus uji bersama).
- **Simpan.** Mengirim seluruh tab ke `save`. Pesan galat dari server
  ditampilkan apa adanya. Tidak ada retry otomatis untuk simpan.
- Tab dashboard dirancang per topik supaya tab baru tinggal ditambahkan.

## Pengujian

- **Bot:** `node --test` untuk (a) penyusun teks dari baris: pengelompokan nama,
  urutan, blok buffland, (b) `masterData.getTab`: berhasil, cache kedaluwarsa
  saat fetch gagal, salinan disk, `null` saat semua gagal, timeout. Fetch
  disuntik sebagai dependensi agar tidak butuh jaringan.
- **Apps Script:** validasi dan penyusunan baris ditulis sebagai fungsi murni di
  `Logic.gs` (gaya SISKOWAL) dan dites dengan `node --test`. Cek PIN dan
  pembatasan percobaan diuji dengan pengganti `CacheService`.
- **Manual:** satu kali alur penuh: ubah kode di dashboard, simpan, kirim `#3` di
  grup uji, pastikan isinya berubah dan tampilan lain sama.

## Urutan kerja

1. Repo `fuuka-dashboard`: Apps Script + tes, isi awal Sheet lewat fungsi `setup`.
2. Bot: `masterData.js`, penyusun teks, perubahan `help.js`, tes.
3. Dashboard: layar PIN, editor, preview.
4. Deploy ke GitHub Pages, isi `MASTER_DATA_URL`, uji manual.

Tiap langkah berdiri sendiri dan bisa dites sebelum lanjut.

## Risiko dan keputusan terbuka

- Kuota Apps Script (jumlah eksekusi per hari) cukup untuk satu guild karena bot
  meng-cache 5 menit.
- Perubahan di dashboard baru terlihat di bot setelah cache habis (maks 5 menit).
  Bila ingin instan, bisa ditambah perintah admin untuk membersihkan cache.
  Tidak dikerjakan sekarang.
- Penyusun teks ada di dua tempat (bot dan dashboard). Sengaja diterima untuk
  tahap ini; bila jadi beban, pindahkan ke paket bersama saat topik kedua dibuat.

# WhatsApp Bot

Bot WhatsApp berbasis Node.js dan Baileys dengan struktur modular, whitelist grup, dan siap dijalankan lokal maupun dideploy ke Render/Koyeb.

## Fitur

- Command modular dengan prefix default `!`
- Hanya aktif di grup yang diizinkan
- Mengabaikan chat pribadi
- Mengabaikan grup di luar whitelist
- Parsing command otomatis
- Mendukung pembuatan stiker dari gambar
- Mendukung konversi stiker menjadi gambar PNG
- Logging koneksi, QR, pesan masuk, dan grup tidak diizinkan
- Autentikasi multi file di folder `auth/`
- Multi-provider AI dengan rotasi banyak API key dan fallback otomatis
- Siap dipakai lokal dan push ke GitHub

## Struktur Project

```text
whatsapp-bot/
│
├── src/
│   ├── index.js
│   ├── config/
│   │   └── settings.js
│   ├── handlers/
│   │   └── messageHandler.js
│   ├── commands/
│   │   ├── ping.js
│   │   ├── menu.js
│   │   └── help.js
│   └── utils/
│       └── groupValidator.js
│
├── auth/
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Cara Install

1. Pastikan Node.js versi 20.9 atau lebih baru sudah terpasang.
2. Install dependency:

```bash
npm install
```

3. Buat file `.env` dari contoh:

```bash
cp .env.example .env
```

Di Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

4. Sesuaikan isi `.env`:

```env
BOT_NAME=Fuuka
BOT_NUMBER=6281234567890
PORT=3000
PREFIX=!
ALLOWED_GROUPS=120363412345678901@g.us,120363499999999@g.us
```

## Cara Menjalankan Lokal

Mode development:

```bash
npm run dev
```

Mode production:

```bash
npm start
```

Saat pertama kali jalan, terminal akan menampilkan QR code. Scan QR tersebut dari aplikasi WhatsApp yang akan dipakai untuk bot.

Jika QR di terminal kurang jelas, buka URL yang dicetak dengan label `[QR] Versi gambar` (default: `http://localhost:3000/qr`). Halaman tersebut menampilkan QR PNG dan memperbaruinya otomatis. Jika bot berjalan di server, isi `QR_BROWSER_URL` dengan URL publik server, misalnya `https://domain-anda.example/qr`.

QR adalah kredensial sementara untuk menghubungkan akun WhatsApp. Jangan membagikan URL tersebut kepada orang lain dan jangan mengekspos endpoint ini tanpa perlindungan jaringan yang sesuai.

## Konfigurasi AI multi-provider

Bot tidak bergantung pada Groq. Provider dipilih lewat `AI_PROVIDERS`; provider yang gagal karena limit, key invalid, model tidak tersedia, atau timeout akan dilewati otomatis.

Contoh konfigurasi Groq Qwen sebagai provider utama dengan Gemini sebagai fallback:

```env
AI_PROVIDERS=groq,gemini
GEMINI_API_KEY=AIza_key_utama
GEMINI_API_KEY_2=AIza_key_cadangan
GEMINI_MODEL=gemini-3.5-flash-lite,gemini-3.8-flash
GROQ_API_KEY=gsk_key_anda
GROQ_MODEL=qwen/qwen3.8-27b
GROQ_REASONING_EFFORT=none
```

Banyak key dapat ditulis dengan nomor (`_2`, `_3`, dan seterusnya) atau dipisahkan koma. Key dipakai bergiliran. Saat terkena rate limit, key tersebut diistirahatkan sementara dan bot mencoba key/provider berikutnya.

Provider OpenAI-compatible juga dapat ditambahkan dengan pola yang sama. Contohnya:

```env
AI_PROVIDERS=gemini,deepinfra
DEEPINFRA_URL=https://api.deepinfra.com/v1/openai/chat/completions
DEEPINFRA_API_KEY=key_anda
DEEPINFRA_MODEL=nama-model-yang-tersedia
```

Gemini memakai API native, sedangkan provider lain memakai format chat completions. Kuota gratis Gemini umumnya dihitung per project, bukan sekadar per API key; buat key cadangan dari project berbeda bila memang diperlukan.

Untuk memeriksa semua kombinasi provider, model, dan key tanpa menampilkan isi key:

```bash
npm run cek-ai
```

## Cara Mendapatkan ID Grup

Project ini sudah menampilkan ID grup otomatis setiap ada pesan masuk:

```js
console.log("Group:", msg.key.remoteJid)
```

Langkahnya:

1. Jalankan bot.
2. Tambahkan bot ke grup yang ingin dipakai.
3. Kirim pesan apa saja di grup tersebut.
4. Lihat terminal, lalu salin nilai `Group: xxxx@g.us`.
5. Tambahkan ID itu ke `ALLOWED_GROUPS` di file `.env`.

Contoh:

```env
ALLOWED_GROUPS=120363412345678901@g.us,120363400000000000@g.us
```

## Menambahkan Grup Baru

1. Ambil ID grup dari log terminal.
2. Tambahkan ke `ALLOWED_GROUPS` dipisahkan koma.
3. Simpan file `.env`.
4. Restart bot.

## Daftar Command

- `!ping` membalas `Pong 🏓`
- `!menu` menampilkan menu bot
- `!help` menampilkan bantuan penggunaan
- `!stiker` mengubah gambar menjadi stiker
- `!gambar` mengubah stiker menjadi gambar PNG
- `!fuuka` membalas `moshi moshi fuuka desu`
- `!info` mencari item lokal berdasarkan stat/kategori

## Fitur Pencarian Item Lokal

Fuuka juga bisa menjawab pertanyaan sederhana berbasis data lokal jika bot di-mention di grup.

Selain mention, kamu juga bisa memakai command langsung:

```text
!info item yang menambah stat hp%
!info special yang menambah max hp
!info weapon crit rate
```

Contoh:

```text
@Fuuka item apa saja yang menambah HP %?
```

Atau:

```text
@Fuuka artifact hp% apa saja?
```

Konfigurasi tambahan di `.env`:

```env
BOT_NUMBER=6281234567890
```

Isi `BOT_NUMBER` dengan nomor WhatsApp bot tanpa tanda `+`.

Data item saat ini dibaca dari:

```text
item stat kategori/
```

## Cara Menggunakan Fitur Stiker

Ada dua cara:

1. Reply gambar dengan pesan `!stiker`
2. Kirim gambar dengan caption `!stiker`

Bot akan mengunduh gambar lalu mengirim balik sebagai stiker WhatsApp.

## Cara Mengubah Stiker Jadi Gambar

Reply stiker dengan pesan:

```text
!gambar
```

Bot akan mengunduh stiker lalu mengirim balik gambar PNG. Untuk stiker animasi, bot mengambil frame pertama sebagai gambar.

## Deploy ke GitHub

1. Inisialisasi git:

```bash
git init
git add .
git commit -m "Initial WhatsApp bot setup"
```

2. Buat repository baru di GitHub.
3. Hubungkan remote:

```bash
git remote add origin https://github.com/USERNAME/NAMA-REPO.git
git branch -M main
git push -u origin main
```

## Deploy ke Render

1. Push project ke GitHub.
2. Login ke Render.
3. Pilih `New +` lalu `Web Service`.
4. Hubungkan repository GitHub project ini.
5. Isi konfigurasi:

- Build Command: `npm install`
- Start Command: `npm start`

6. Tambahkan environment variables:

- `PORT`
- `PREFIX`
- `ALLOWED_GROUPS`

7. Deploy service.

Catatan:

- Folder `auth/` berisi session login dan tidak disimpan ke git.
- Jika deploy ulang di instance gratis, session bisa hilang sehingga QR perlu discan ulang.

## Deploy ke Koyeb

1. Push project ke GitHub.
2. Login ke Koyeb.
3. Buat App baru dari repository GitHub.
4. Gunakan:

- Build command: `npm install`
- Run command: `npm start`

5. Tambahkan environment variables yang sama seperti di `.env`.
6. Deploy dan cek log.

## Catatan Penting Hosting Gratis

- Hosting gratis sering sleep atau restart otomatis.
- Session WhatsApp bisa ter-reset jika storage tidak persisten.
- Untuk penggunaan stabil jangka panjang, lebih aman gunakan persistent disk atau VPS.

## Troubleshooting

- Jika QR tidak muncul, hapus folder `auth/` lalu jalankan ulang.
- Jika bot tidak merespons, pastikan ID grup sudah benar di `ALLOWED_GROUPS`.
- Jika command tidak jalan, cek prefix di `.env`.
- Jika deploy gagal, cek log dependency dan versi Node.js.

## Test Lokal Pertama

Urutan yang disarankan:

1. `npm install`
2. `Copy-Item .env.example .env`
3. Edit `.env`
4. `npm run dev`
5. Scan QR
6. Kirim `!ping` di grup yang diizinkan

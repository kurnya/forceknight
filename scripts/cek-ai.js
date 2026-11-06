/**
 * Cek semua kombinasi provider x model x key AI di .env.
 * Jalankan: npm run cek-ai
 * Isi key tidak pernah ditampilkan — hanya label seperti "Gemini#2".
 */
require("dotenv").config();

const { describeProviders, probeAll } = require("../src/services/aiProviders");

function explain(row) {
  if (row.ok) return "berfungsi";
  if (row.status === 401 || row.status === 403 || /api[_ ]?key/i.test(row.error)) return "key salah / tidak aktif";
  if (row.status === 402) return "kuota/tagihan akun habis (402)";
  if (row.status === 429) return /per ?day|daily/i.test(row.error) ? "kuota harian habis" : "kena limit per menit";
  if (row.status === 404 || /model/i.test(row.error)) return "nama model salah / tidak tersedia";
  if (/respons kosong/.test(row.error)) return "terhubung, tapi balasan kosong (model terlalu lama 'berpikir'?)";
  return row.error || `error ${row.status}`;
}

(async () => {
  console.log(`Provider: ${describeProviders()}\n`);
  const rows = await probeAll();

  if (!rows.length) {
    console.log("Tidak ada key AI di .env.");
    process.exit(1);
  }

  for (const row of rows) {
    console.log(`${row.ok ? "✅" : "❌"} ${row.label.padEnd(14)} ${row.model.padEnd(32)} ${explain(row)}`);
  }

  const working = rows.filter((row) => row.ok).length;
  console.log(`\n${working}/${rows.length} kombinasi berfungsi.`);
  process.exit(working ? 0 : 1);
})();

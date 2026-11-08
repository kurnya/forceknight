// Menyusun isi topik #3 (Kode Buff) dari data Sheet. Fungsi murni, tanpa I/O.
// Isinya sama dengan lib/buffText.js di repo fuuka-dashboard; keduanya dijaga lewat
// tests/fixtures/buff-cases.json yang sama.

const DIVIDER = "━━━━━━━━━━━━━━━━━━━━";
const LABEL_WIDTH = 11;

function sortByUrutan(rows) {
  return rows
    .map((row, pos) => ({ row, pos }))
    .sort((a, b) => a.row.urutan - b.row.urutan || a.pos - b.pos)
    .map((item) => item.row);
}

// Baris berurutan dengan nama sama jadi satu kelompok; nama sama yang terpisah tetap kelompok terpisah.
function groupBuffs(rows) {
  const groups = [];
  for (const row of sortByUrutan(rows)) {
    const last = groups[groups.length - 1];
    if (last && last.nama === row.nama) {
      last.kode.push(row.kode);
    } else {
      groups.push({ nama: row.nama, kode: [row.kode] });
    }
  }
  return groups;
}

function buildBuffBody(buffRows, bufflandRows) {
  const lines = [DIVIDER, "Kode Buff Player Toram", DIVIDER, "", "*List Buff*", ""];

  for (const group of groupBuffs(buffRows)) {
    lines.push(group.nama, ...group.kode, "");
  }

  if (bufflandRows.length > 0) {
    lines.push("*Code buffland member/admin*", "");
    for (const row of sortByUrutan(bufflandRows)) {
      lines.push(`${row.label.padEnd(LABEL_WIDTH)}: ${row.nama}`);
    }
    lines.push("");
  }

  lines.push(DIVIDER);
  return lines.join("\n");
}

module.exports = { buildBuffBody };

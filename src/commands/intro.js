const welcomeLines = [
  "Welcome to Force Knight",
  "",
  "Berdiri Sejak: 21-02-2021",
  "",
  "Info Seputar Force Knight:",
  "https://linktr.ee/ForceKnightGuild",
  "",
  "Link Discord:",
  "https://discord.gg/nQf63nprKW",
  "",
  "Link drive guild untuk melihat Dokumentasi:",
  "https://drive.google.com/drive/folders/1lsaHilMM-MNmwQ-7gPmZGOX0jTTyAoCM",
  "",
  "Youtube untuk Guide:",
  "https://youtube.com/@forceknightguild?si=ZcPzEem9TqVfOPIR",
  "",
  "Ketik \"Help\" untuk menggunakan bot guild",
  "",
  "Seragam: Baju Pesta Dirgahayu III A5B5C54",
  "Gathering: Setiap Tgl 21 (per 2 bulan), 20.00 wib",
  "Raid Guild: Setiap Hari Sabtu, 20.00 wib (kondisional)",
  "Peminjaman Up Xtall: Lapor di Discord",
  "",
  "RULES",
  "1. Jika member guild sudah full (89/89), maka ada batas off maksimal 15 hari.",
  "2. Bagi yang on toram harap mengikuti acara guild (seperti gathering & raid).",
  "3. Syarat new member mendapatkan seragam guild: Ikut Gathering.",
  "4. Bagi yang telah diberikan seragam: Apabila ketika gathering tidak mengenakan seragam tersebut (dikarenakan hilang atau lainnya), maka buatlah sendiri seragam yang serupa."
];

const memberIntroLines = [
  "",
  "Selamat datang di guild Force Knight moga betah ya! （｡>‿‿<｡）",
  "Intro Member Force Knight:",
  "",
  "IGN / In Game Name :",
  "Lvl Char tertinggi        :",
  "Job Favorit                  :",
  "Buff Kamar                 :",
  "Alamat Kamar            :",
  "",
  "@Ketik Fuuka untuk memakai bot guild (≡^∇^≡)"
];

module.exports = {
  name: "intro",
  description: "Kirim pesan sambutan dan template intro member guild.",
  execute: async ({ sock, message, mentionedJids = [], quotedParticipant = null }) => {
    // Kumpulkan target: dari mention eksplisit atau dari quoted participant (reply)
    const targets = mentionedJids.length > 0
      ? mentionedJids
      : quotedParticipant
        ? [quotedParticipant]
        : [];

    if (!targets.length) {
      return;
    }

    await sock.sendMessage(
      message.key.remoteJid,
      {
        text: welcomeLines.join("\n")
      },
      {
        quoted: message
      }
    );

    await sock.sendMessage(
      message.key.remoteJid,
      {
        text: memberIntroLines.join("\n")
      },
      {
        quoted: message
      }
    );
  }
};

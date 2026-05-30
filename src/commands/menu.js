const settings = require("../config/settings");

const divider = "━━━━━━━━━━━━━━━━━━━━";

const menuHeaderIntros = [
  "Yahhoo~ Fuuka bawain menu kecil buat onii-chan yaa~ (o^▽^o)",
  "Ehehe, ini daftar fitur yang bisa dipakai di grup ini~ (≧▽≦)",
  "Fuuka buka catatan command dulu yaa, pilih yang dibutuhkan~ (๑˃ᴗ˂)ﻭ",
  "Tadaaa~ menu Fuuka datang dengan rapi dan manis~ (｡>‿‿<｡)",
  "Sini sini, Fuuka tunjukin command yang tersedia yaa~ (≧ω≦)"
];

const menuFooterNotes = [
  "Pakai command-nya pelan-pelan yaa, Fuuka siap bantu~ (o^▽^o)",
  "Kalau bingung, panggil Fuuka lagi aja yaa~ (≧◡≦)",
  "Semoga menunya membantu, onii-chan~ (๑˃ᴗ˂)ﻭ",
  "Fuuka tunggu panggilan berikutnya dengan manis~ (｡>‿‿<｡)",
  "Gunakan fitur seperlunya biar bot tetap ringan yaa~ (≧ω≦)"
];

const commandMenuItems = [
  {
    name: "menu",
    usage: (prefix) => `${prefix}menu`,
    description: "Lihat daftar command yang tersedia di grup ini."
  },
  {
    name: "stiker",
    usage: (prefix) => `${prefix}stiker`,
    description: "Ubah gambar/video pendek menjadi stiker."
  },
  {
    name: "audio",
    usage: (prefix) => `${prefix}mp3 <link YouTube>`,
    description: "Ambil audio MP3 dari link YouTube. Maksimal 10 menit, jangan spam yaa nanti Fuuka cemberut! (｡•́︿•̀｡)"
  },
  {
    name: "help",
    usage: (prefix) => `${prefix}help`,
    description: "Buka panduan guild dan topik info Force Knight."
  },
  {
    name: "intro",
    usage: (prefix) => `${prefix}intro @member`,
    description: "Kirim sambutan dan template intro member baru."
  },
  {
    name: "fuuka",
    usage: () => "fuuka",
    description: "Panggil Fuuka tanpa prefix untuk balasan santai."
  }
];

const alwaysVisibleCommandNames = new Set(["menu"]);

function pickRandomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function getAllowedMenuItems(remoteJid) {
  const enabledCommands = new Set(settings.enabledCommands);
  const allowedCommandsForGroup = settings.groupCommandRules.get(remoteJid);

  return commandMenuItems.filter((item) => {
    if (alwaysVisibleCommandNames.has(item.name)) {
      return true;
    }

    if (!enabledCommands.has(item.name)) {
      return false;
    }

    if (allowedCommandsForGroup && !allowedCommandsForGroup.has(item.name)) {
      return false;
    }

    return true;
  });
}

function buildMenuText(prefix, remoteJid) {
  const menuItems = getAllowedMenuItems(remoteJid);
  const lines = [
    divider,
    "Menu Fuuka",
    divider,
    "",
    pickRandomItem(menuHeaderIntros),
    "",
    "Command tersedia:"
  ];

  for (const [index, item] of menuItems.entries()) {
    lines.push(`${index + 1}. ${item.usage(prefix)}`);
    lines.push(`   ${item.description}`);
  }

  lines.push(
    "",
    `Prefix aktif: ${prefix}`,
    "",
    pickRandomItem(menuFooterNotes),
    divider
  );

  return lines.join("\n");
}

module.exports = {
  name: "menu",
  aliases: ["commands", "cmd", "fitur"],
  description: "Menampilkan daftar command umum yang bisa digunakan.",
  execute: async ({ sock, message, prefix }) => {
    await sock.sendMessage(
      message.key.remoteJid,
      {
        text: buildMenuText(prefix, message.key.remoteJid)
      },
      {
        quoted: message
      }
    );
  }
};

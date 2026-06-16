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
    description: "Lihat daftar fitur."
  },
  {
    name: "stiker",
    usage: (prefix) => `${prefix}stiker`,
    description: "Buat stiker dari gambar/video."
  },
  {
    name: "gambar",
    usage: (prefix) => `${prefix}gambar`,
    description: "Ubah stiker jadi gambar PNG."
  },
  {
    name: "gif",
    usage: (prefix) => `${prefix}gif`,
    description: "Ubah stiker bergerak jadi GIF."
  },
  {
    name: "video",
    usage: (prefix) => `${prefix}video`,
    description: "Ubah stiker bergerak jadi MP4."
  },
  {
    name: "audio",
    usage: (prefix) => `${prefix}mp3 <link YouTube>`,
    description: "Download audio YouTube."
  },
  {
    name: "help",
    usage: (prefix) => `${prefix}help`,
    description: "Panduan guild Force Knight."
  },
  {
    name: "intro",
    usage: (prefix) => `${prefix}intro @member`,
    description: "Sambutan member baru."
  },
  {
    name: "fuuka",
    usage: () => "fuuka",
    description: "Panggil Fuuka santai."
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
    lines.push(`${index + 1}. ${item.usage(prefix)} - ${item.description}`);
  }

  if (menuItems.some((item) => item.name === "audio")) {
    lines.push("", "Catatan MP3:");
    lines.push("Maksimal 10 menit. Jangan spam yaa, nanti Fuuka cemberut! (｡•́︿•̀｡)");
  }

  lines.push(
    "",
    divider,
    pickRandomItem(menuFooterNotes)
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

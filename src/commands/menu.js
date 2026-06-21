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
    name: "audio",
    usage: (prefix) => `${prefix}mp3 <link YouTube>`,
    description: "Download audio YouTube."
  },
  {
    name: "help",
    usage: (prefix) => `${prefix}help [nomor]`,
    description: "Panduan lengkap guild Force Knight."
  },
  {
    name: "intro",
    usage: (prefix) => `${prefix}intro @member`,
    description: "Sambutan member baru."
  }
];

const fuukaFeatures = [
  {
    category: "🌸 Fitur Fuuka AI",
    items: [
      {
        name: "Chat AI",
        usage: () => "@fuuka [pesan]",
        description: "Ngobrol santai dengan Fuuka pakai AI"
      },
      {
        name: "Auto Help",
        usage: () => "@fuuka jelaskan blacksmith",
        description: "Otomatis panggil command help sesuai topik"
      },
      {
        name: "Greeting",
        usage: () => "@fuuka selamat pagi",
        description: "Sapa Fuuka sesuai waktu (pagi/siang/sore/malam)"
      },
      {
        name: "Compliment",
        usage: () => "@fuuka kamu imut banget",
        description: "Puji Fuuka dan dapatkan respon manis"
      },
      {
        name: "Reply Chat",
        usage: () => "Reply pesan Fuuka",
        description: "Lanjutkan percakapan tanpa perlu @mention"
      },
      {
        name: "Time-Aware Mood",
        usage: () => "(otomatis)",
        description: "Mood Fuuka berubah sesuai waktu WIB"
      }
    ]
  },
  {
    category: "📚 Topik Auto-Help (Sebutkan saja!)",
    items: [
      { topic: "#1", name: "Guild & Sejarah", keywords: "guild, sejarah, force knight" },
      { topic: "#2", name: "Panduan Newbie", keywords: "newbie, pemula, beginner" },
      { topic: "#3", name: "Kode Buff", keywords: "buff, player buff" },
      { topic: "#4", name: "Bahan MQ", keywords: "bahan mq, main quest" },
      { topic: "#5", name: "Perluas Tas", keywords: "tas, bag, inventory" },
      { topic: "#6", name: "Leveling Char", keywords: "leveling, level, exp" },
      { topic: "#7", name: "Tips Refine", keywords: "refine, upgrade senjata" },
      { topic: "#8", name: "Stat Blacksmith", keywords: "blacksmith, stat bs, tempa" },
      { topic: "#9", name: "Profesi Tempa", keywords: "profesi tempa, kemahiran tempa" },
      { topic: "#10", name: "Potensial Equipment", keywords: "potensial, potential, enchant" },
      { topic: "#11", name: "Profesi Padu", keywords: "profesi padu, kemahiran padu" },
      { topic: "#12", name: "Xtall Master", keywords: "xtall master, xtal master" },
      { topic: "#13", name: "Xtall Event", keywords: "xtall event, xtal event" },
      { topic: "#14", name: "Info Pet", keywords: "pet, hewan peliharaan" },
      { topic: "#15", name: "Tips Raid", keywords: "raid, boss raid" },
      { topic: "#16", name: "Status Karakter", keywords: "status, stat, atribut" },
      { topic: "#17", name: "Ailment & Interrupt", keywords: "ailment, interrupt, debuff" },
      { topic: "#98", name: "Kata Mutiara Sepuh", keywords: "kata mutiara, sepuh, quotes" },
      { topic: "#99", name: "Tes Kehokian", keywords: "tes hoki, kehokian, luck" }
    ]
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
    "━━━━━━━━━━━━━━━━━━━━",
    "🔧 Command Umum:",
    "━━━━━━━━━━━━━━━━━━━━",
    ""
  ];

  for (const [index, item] of menuItems.entries()) {
    lines.push(`${index + 1}. ${item.usage(prefix)} - ${item.description}`);
  }

  lines.push(
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "🌸 Fitur Fuuka AI:",
    "━━━━━━━━━━━━━━━━━━━━",
    ""
  );

  const fuukaAIFeatures = fuukaFeatures[0].items;
  for (const [index, feature] of fuukaAIFeatures.entries()) {
    lines.push(`${index + 1}. ${feature.usage()} - ${feature.description}`);
  }

  lines.push(
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "💡 Tips Auto-Help:",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "Sebutkan saja topik game, Fuuka otomatis panggil info lengkapnya!",
    "Contoh: @fuuka jelaskan blacksmith → Otomatis muncul #8",
    "Lihat semua topik: !help"
  );

  if (menuItems.some((item) => item.name === "audio")) {
    lines.push("", "━━━━━━━━━━━━━━━━━━━━");
    lines.push("📝 Catatan MP3:");
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

const settings = require("../config/settings");

const commandMenuItems = [
  {
    name: "menu",
    usage: (prefix) => `${prefix}menu`,
    description: "Menampilkan daftar command umum bot."
  },
  {
    name: "stiker",
    usage: (prefix) => `${prefix}stiker`,
    description: "Ubah gambar atau video pendek menjadi stiker. Bisa kirim media dengan caption atau reply media."
  },
  {
    name: "audio",
    usage: (prefix) => `${prefix}mp3 <link YouTube>`,
    description: "Ambil audio MP3 dari link YouTube. Maksimal durasi mengikuti batas server."
  },
  {
    name: "help",
    usage: (prefix) => `${prefix}help`,
    description: "Menampilkan panduan guild dan daftar topik info Force Knight."
  },
  {
    name: "intro",
    usage: (prefix) => `${prefix}intro @member`,
    description: "Kirim sambutan guild dan template intro untuk member baru."
  },
  {
    name: "fuuka",
    usage: () => "fuuka",
    description: "Panggil Fuuka tanpa prefix untuk balasan santai."
  }
];

const alwaysVisibleCommandNames = new Set(["menu"]);

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
  const lines = ["Menu Fuuka"];
  const menuItems = getAllowedMenuItems(remoteJid);

  for (const item of menuItems) {
    lines.push("", item.usage(prefix), item.description);
  }

  lines.push("", "Catatan:", `Prefix aktif saat ini: ${prefix}`);

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

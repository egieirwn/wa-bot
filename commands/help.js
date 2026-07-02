const fs = require('fs')
const path = require('path')

module.exports = {
  name: 'help',
  description: 'Tampilkan daftar command',
  async execute(sock, msg, from, args) {
    const commandsPath = path.join(__dirname);
    const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

    // Muat semua command
    const commands = files.map(file => require(path.join(commandsPath, file)));

    // Definisikan kategori untuk merapikan tampilan
    const categories = {
      '🧠 AI Assistant': ['jarvis'],
      '📥 Downloader': ['ig', 'tiktok', 'yt', 'facebook', 'twitter'],
      '🎨 Media & Stiker': ['sticker', 'tosticker', 'to', 'gift', 'addcaption'],
      '🛠️ Tools & Utility': ['help', 'ping', 'tagall', 'tempmail', 'rvo'],
      '🎮 Fun & Games': ['tod', 'fake']
    };

    let text = '╭───── 🤖 *ANTIGRAVITY BOT* ─────\n';
    text += '│\n';
    text += '│ Halo! Berikut adalah daftar fitur canggih\n';
    text += '│ yang siap membantu Anda:\n';
    text += '│\n';

    let usedCommands = new Set();

    // Loop untuk setiap kategori
    for (const [categoryName, categoryCmds] of Object.entries(categories)) {
      text += `├─ *${categoryName}*\n`;
      
      const cmdsInCategory = commands.filter(cmd => categoryCmds.includes(cmd.name));
      if (cmdsInCategory.length > 0) {
        cmdsInCategory.forEach(cmd => {
          usedCommands.add(cmd.name);
          const desc = cmd.description ? cmd.description : 'Tidak ada deskripsi';
          text += `│ ◦ *!${cmd.name}* — ${desc}\n`;
        });
      } else {
         text += `│ ◦ (Belum ada)\n`;
      }
      text += '│\n';
    }

    // Jika ada command baru yang belum masuk kategori di atas
    const uncategorized = commands.filter(cmd => !usedCommands.has(cmd.name));
    if (uncategorized.length > 0) {
      text += `├─ *🧩 Fitur Lainnya*\n`;
      uncategorized.forEach(cmd => {
        const desc = cmd.description ? cmd.description : 'Tidak ada deskripsi';
        text += `│ ◦ *!${cmd.name}* — ${desc}\n`;
      });
      text += '│\n';
    }

    text += '╰────────────────────────\n';
    text += '💡 _Tips: Kirim pesan dengan fitur di atas untuk melihat panduan detailnya._';

    await sock.sendMessage(from, { text }, { quoted: msg });
  }
}
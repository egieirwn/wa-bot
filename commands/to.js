module.exports = {
  name: 'to',
  description: 'Alias untuk merubah teks menjadi sticker (!to sticker)',
  execute: async (sock, msg, from, args) => {
    // Mengecek apakah kata setelah !to adalah "sticker"
    if (args[0] && args[0].toLowerCase() === 'sticker') {
      // Hapus kata 'sticker' dari array argumen
      args.shift();
      
      // Panggil file tosticker.js untuk mengeksekusi sisanya
      const toStickerCmd = require('./tosticker.js');
      return await toStickerCmd.execute(sock, msg, from, args);
    } else {
       await sock.sendMessage(from, { text: '❌ Command tidak lengkap. Maksud Anda *!to sticker*?' }, { quoted: msg });
    }
  }
};

module.exports = {
  name: 'clearremind',
  description: 'Hapus semua pengingat aktif di chat ini',
  hide: true, // Tidak ditampilkan di daftar !help
  async execute(sock, msg, from, args, allCommands) {
    if (allCommands?.['remind']) {
      return await allCommands['remind']._cancelAllReminders(sock, msg, from);
    }
    await sock.sendMessage(from, { text: '❌ Fitur reminder tidak ditemukan.' }, { quoted: msg });
  }
};

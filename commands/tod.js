const groupHistory = {}; // Objek untuk menyimpan riwayat (nama dan dadu sebelumnya) per grup

module.exports = {
  name: 'tod',
  description: 'Memilih anggota grup secara acak untuk Truth or Dare',
  execute: async (sock, msg, from, args) => {
    // Pastikan command hanya berjalan di dalam grup
    const isGroup = from.endsWith('@g.us');

    if (!isGroup) {
      return await sock.sendMessage(from, { text: '❌ Command ini hanya bisa digunakan di dalam grup!' }, { quoted: msg });
    }

    try {
      // Mengambil metadata grup untuk melihat daftar member
      const groupMetadata = await sock.groupMetadata(from);
      const participants = groupMetadata.participants;

      // Filter out nomor bot sendiri agar bot tidak memilih dirinya sendiri
      const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      const membersOnly = participants.filter(p => p.id !== botId);

      if (membersOnly.length === 0) {
        return await sock.sendMessage(from, { text: 'Grup ini kosong atau hanya ada bot.' }, { quoted: msg });
      }

      // Inisialisasi history untuk grup ini jika belum ada
      if (!groupHistory[from]) {
        groupHistory[from] = { lastMember: null, lastDice: null };
      }

      let selectedMember;

      // ALGORITMA NAMA ACAK:
      // Mencegah nama yang sama muncul 2 kali berturut-turut
      if (membersOnly.length > 1) {
        do {
          const randomIndex = Math.floor(Math.random() * membersOnly.length);
          selectedMember = membersOnly[randomIndex].id;
        } while (selectedMember === groupHistory[from].lastMember); // Ulangi jika namanya sama dengan yang sebelumnya
      } else {
        selectedMember = membersOnly[0].id;
      }

      // ALGORITMA DADU ACAK:
      // Mencegah angka dadu yang sama muncul 2 kali berturut-turut
      let randomDice;
      do {
        randomDice = Math.floor(Math.random() * 13); // Angka acak 0 - 12
      } while (randomDice === groupHistory[from].lastDice); // Ulangi jika angkanya sama dengan yang sebelumnya

      // Menyimpan hasil saat ini ke riwayat (history) untuk dicek pada lemparan berikutnya
      groupHistory[from].lastMember = selectedMember;
      groupHistory[from].lastDice = randomDice;

      const todText = `🎲 *HASIL LEMPAR DADU* \n\n🎯 Terpilih: @${selectedMember.split('@')[0]}\n🎲 Angka Dadu: ${randomDice}`;

      await sock.sendMessage(from, {
        text: todText,
        mentions: [selectedMember]
      }, { quoted: msg });

    } catch (err) {
      console.error('Error di command tod:', err);
      await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat mengambil data grup. Pastikan bot adalah admin atau coba lagi nanti.' }, { quoted: msg });
    }
  }
};

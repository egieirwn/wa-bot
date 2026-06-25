module.exports = {
  name: 'fake',
  description: 'Membuat balasan palsu untuk nge-prank teman. Cara: reply pesannya lalu ketik !fake Teks Palsu | Balasan Bot',
  async execute(sock, msg, from, args) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo;
    
    if (!quoted) {
      return await sock.sendMessage(from, { text: '❌ Anda harus nge-*reply* pesan seseorang terlebih dahulu!\nContoh: *!fake Aku pinjam uang dong 100rb | Gak ada duit bro!*' }, { quoted: msg });
    }

    const input = args.join(' ');
    if (!input.includes('|')) {
       return await sock.sendMessage(from, { text: '❌ Format salah!\nContoh penggunaan:\n*!fake [Teks Palsu Korban] | [Balasan Bot]*\n\nMisal: *!fake Aku kangen mantan | Dih gagal move on!*' }, { quoted: msg });
    }

    const parts = input.split('|');
    const teksPalsuKorban = parts[0].trim();
    const balasanBot = parts[1].trim();

    // Dapatkan ID/nomor WA korban dari pesan yang direply
    const targetJid = quoted.participant || msg.key.participant || msg.key.remoteJid;

    // Membuat objek struktur "Pesan Palsu" seolah-olah itu dikirim dari korban
    const pesanPalsu = {
        key: {
            remoteJid: from,
            fromMe: false,
            id: 'BAE5' + Math.floor(Math.random() * 100000000000), // Bikin ID acak
            participant: targetJid
        },
        message: {
            conversation: teksPalsuKorban
        }
    };

    // Bot mengirimkan balasan dengan mengutip (quote) pesan palsu tersebut
    await sock.sendMessage(from, {
        text: balasanBot
    }, {
        quoted: pesanPalsu
    });
  }
};

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'gift', // typo user: gift. (Aslinya gif)
  description: 'Ubah video yang direply menjadi GIF (Video berulang)',
  async execute(sock, msg, from, args) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const videoMsg = msg.message?.videoMessage || quoted?.videoMessage;

    if (!videoMsg) {
      return await sock.sendMessage(from, { text: '❌ Silakan *reply* sebuah video pendek dan ketik *!gift* (atau kirim video dengan caption !gift).' }, { quoted: msg });
    }

    // Batasi ukuran video (misal maksimal 10 detik agar tidak berat)
    if (videoMsg.seconds && videoMsg.seconds > 15) {
       return await sock.sendMessage(from, { text: '❌ Video terlalu panjang! Maksimal durasi untuk GIF adalah 15 detik.' }, { quoted: msg });
    }

    await sock.sendMessage(from, { text: '⏳ Sedang mengubah video menjadi GIF...' }, { quoted: msg });

    try {
      // Download video dari WhatsApp
      const stream = await downloadContentFromMessage(videoMsg, 'video');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      // Kirim ulang sebagai GIF (gifPlayback: true membuat WA memutarnya tanpa suara dan berulang-ulang)
      await sock.sendMessage(from, {
        video: buffer,
        gifPlayback: true, // Ini adalah kunci yang mengubah video biasa menjadi GIF di WA
        caption: '✅ *Berhasil diubah ke GIF*'
      }, { quoted: msg });

    } catch (err) {
      console.error('Error gift/gif:', err);
      await sock.sendMessage(from, { text: '❌ Gagal memproses video. Pastikan itu adalah video yang valid.' }, { quoted: msg });
    }
  }
};

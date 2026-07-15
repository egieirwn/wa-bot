const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');

module.exports = {
  name: 'toimg',
  description: 'Mengubah stiker menjadi gambar biasa (PNG/GIF). Caranya: Reply stiker dengan teks *!toimg*',
  async execute(sock, msg, from, args) {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const stickerMsg = quotedMsg?.stickerMessage;

    if (!stickerMsg) {
      return await sock.sendMessage(
        from, 
        { text: '❌ *Perintah Gagal!*\nSilakan balas (reply) stiker yang ingin diubah menjadi gambar dengan mengetik *!toimg*.' }, 
        { quoted: msg }
      );
    }

    try {
      await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

      // Unduh stiker menggunakan direct stream downloader Baileys
      const stream = await downloadContentFromMessage(stickerMsg, 'sticker');
      let buffer = Buffer.from([]);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      if (!buffer || buffer.length === 0) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
        return await sock.sendMessage(from, { text: '❌ Gagal mengunduh stiker dari server WhatsApp.' }, { quoted: msg });
      }

      // Deteksi metadata stiker (apakah bergerak/animasi)
      const metadata = await sharp(buffer, { animated: true }).metadata();
      const isAnimated = (metadata.pages || 1) > 1;

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

      if (isAnimated) {
        // Konversi stiker bergerak ke GIF
        const gifBuffer = await sharp(buffer, { animated: true })
          .gif()
          .toBuffer();

        await sock.sendMessage(
          from, 
          { video: gifBuffer, gifPlayback: true, caption: '✨ *Stiker Bergerak berhasil diubah ke GIF!*' }, 
          { quoted: msg }
        );
      } else {
        // Konversi stiker biasa ke PNG
        const pngBuffer = await sharp(buffer)
          .png()
          .toBuffer();

        await sock.sendMessage(
          from, 
          { image: pngBuffer, caption: '✨ *Stiker berhasil diubah ke gambar PNG!*' }, 
          { quoted: msg }
        );
      }

    } catch (err) {
      console.error('Error in toimg:', err);
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      await sock.sendMessage(
        from, 
        { text: `❌ *Gagal mengonversi stiker!*\n_${err.message}_` }, 
        { quoted: msg }
      );
    }
  }
};

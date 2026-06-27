const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');

function escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}

module.exports = {
  name: 'addcaption',
  description: 'Menambahkan teks di bawah stiker. Balas (reply) sebuah stiker dengan !addcaption Teks Anda',
  async execute(sock, msg, from, args) {
    const text = args.join(' ');
    
    if (!text) {
      return await sock.sendMessage(from, { text: '❌ Masukkan teksnya!\nContoh: *!addcaption Halo*' }, { quoted: msg });
    }

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const stickerMsg = quoted?.stickerMessage;
    
    if (!stickerMsg) {
      return await sock.sendMessage(from, { text: '❌ Anda harus me-reply (membalas) sebuah stiker!' }, { quoted: msg });
    }

    await sock.sendMessage(from, { text: '⏳ Sedang memproses stiker...' }, { quoted: msg });

    try {
      // Download stiker
      const stream = await downloadContentFromMessage(stickerMsg, 'sticker');
      let buffer = Buffer.from([]);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      // Ambil dimensi gambar stiker (mendukung stiker bergerak/animasi)
      const image = sharp(buffer, { animated: true });
      const metadata = await image.metadata();
      const width = metadata.width || 512;
      // Gunakan pageHeight untuk stiker animasi agar SVG berukuran 1 frame, bukan seluruh panjang frame
      const height = metadata.pageHeight || metadata.height || 512;

      // Font size disesuaikan dengan lebar stiker (kira-kira 12% dari lebar)
      const fontSize = Math.floor(width * 0.12);
      const strokeWidth = Math.max(2, Math.floor(width * 0.015));
      
      // Render SVG Teks bergaya Meme (Putih dengan outline hitam)
      const svgText = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <text x="50%" y="95%" style="fill: white; stroke: black; stroke-width: ${strokeWidth}px; font-family: sans-serif; font-size: ${fontSize}px; font-weight: bold; text-anchor: middle;">${escapeXml(text)}</text>
        </svg>
      `;

      // Menempelkan teks di atas stiker
      const finalBuffer = await image
        .composite([
          {
            input: Buffer.from(svgText),
            top: 0,
            left: 0,
            tile: true // tile: true diperlukan agar SVG menempel di setiap frame jika stiker bergerak
          }
        ])
        .webp({ quality: 80, effort: 6 }) // Compress untuk stiker WhatsApp
        .toBuffer();

      // Mengirimkan hasil sebagai stiker
      await sock.sendMessage(from, { sticker: finalBuffer }, { quoted: msg });

    } catch (err) {
      console.error('Error addcaption:', err);
      // Mengirimkan err.stack agar kita tahu baris mana yang error jika masih gagal
      await sock.sendMessage(from, { text: `❌ Terjadi kesalahan saat memproses stiker:\n_${err.stack || err.message}_` }, { quoted: msg });
    }
  }
};

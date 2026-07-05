const axios = require('axios');

module.exports = {
  name: 'qr',
  description: 'Membuat QR Code dari teks atau link. Contoh: !qr https://google.com',
  async execute(sock, msg, from, args) {
    const text = args.join(' ');
    if (!text) {
      return await sock.sendMessage(from, { text: '❌ Masukkan teks atau link yang ingin dijadikan QR Code!\nContoh: *!qr https://google.com*' }, { quoted: msg });
    }

    try {
      await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(text)}`;
      
      // Download image buffer
      const response = await axios.get(qrUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data, 'binary');

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
      await sock.sendMessage(from, { 
        image: buffer, 
        caption: `🤖 *QR Code Generator*\n\n◦ *Data:* ${text}` 
      }, { quoted: msg });

    } catch (err) {
      console.error('Error generating QR:', err);
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      await sock.sendMessage(from, { text: `❌ Gagal membuat QR Code.\n_${err.message}_` }, { quoted: msg });
    }
  }
};

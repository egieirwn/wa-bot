const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const Tesseract = require('tesseract.js');

module.exports = {
  name: 'ocr',
  description: 'Mengekstrak teks dari foto. Kirim foto dengan caption !ocr, atau balas foto dengan !ocr',
  async execute(sock, msg, from, args) {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imageMsg = msg.message?.imageMessage || quotedMsg?.imageMessage;

    if (!imageMsg) {
      return await sock.sendMessage(from, { text: '❌ Silakan kirim foto dengan caption *!ocr*, atau reply (balas) foto yang ingin disalin teksnya dengan perintah *!ocr*' }, { quoted: msg });
    }

    try {
      await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });
      const processMsg = await sock.sendMessage(from, { text: '⏳ Sedang membaca teks pada gambar... (Proses pertama kali mungkin memakan waktu lebih lama untuk mengunduh modul bahasa)' }, { quoted: msg });

      // Download gambar
      const stream = await downloadContentFromMessage(imageMsg, 'image');
      let buffer = Buffer.from([]);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      // Jalankan OCR (menggunakan bahasa Indonesia + Inggris)
      const { data: { text } } = await Tesseract.recognize(buffer, 'ind+eng');

      // Hapus pesan loading
      try {
        await sock.sendMessage(from, {
          delete: processMsg.key
        });
      } catch (e) {
        // Abaikan jika gagal delete
      }

      if (!text || !text.trim()) {
        await sock.sendMessage(from, { react: { text: '🤷‍♂️', key: msg.key } });
        return await sock.sendMessage(from, { text: '❌ Tidak ditemukan teks di dalam gambar tersebut.' }, { quoted: msg });
      }

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
      await sock.sendMessage(from, { 
        text: `📝 *Hasil Salin Teks (OCR):*\n━━━━━━━━━━━━━━━\n\n${text.trim()}` 
      }, { quoted: msg });

    } catch (err) {
      console.error('Error OCR:', err);
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      await sock.sendMessage(from, { text: `❌ Gagal memproses gambar.\n_${err.message}_` }, { quoted: msg });
    }
  }
};

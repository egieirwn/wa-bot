const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');

module.exports = {
  name: 'qr',
  description: 'Membuat QR Code dari teks, link, atau media (foto/video/audio/dokumen).',
  async execute(sock, msg, from, args) {
    // Tentukan tipe media
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    
    const mediaMsg = msg.message?.imageMessage 
      || msg.message?.videoMessage 
      || msg.message?.audioMessage 
      || msg.message?.documentMessage 
      || msg.message?.stickerMessage
      || quotedMsg?.imageMessage 
      || quotedMsg?.videoMessage 
      || quotedMsg?.audioMessage 
      || quotedMsg?.documentMessage
      || quotedMsg?.stickerMessage;

    let mediaType = '';
    if (msg.message?.imageMessage || quotedMsg?.imageMessage) mediaType = 'image';
    else if (msg.message?.videoMessage || quotedMsg?.videoMessage) mediaType = 'video';
    else if (msg.message?.audioMessage || quotedMsg?.audioMessage) mediaType = 'audio';
    else if (msg.message?.documentMessage || quotedMsg?.documentMessage) mediaType = 'document';
    else if (msg.message?.stickerMessage || quotedMsg?.stickerMessage) mediaType = 'sticker';

    let dataText = args.join(' ');

    try {
      await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

      // Jika ada media, upload ke hosting dulu untuk dapat link
      if (mediaMsg && mediaType) {
        await sock.sendMessage(from, { text: `⏳ Mengunduh dan mengupload ${mediaType} Anda...` }, { quoted: msg });

        const stream = await downloadContentFromMessage(mediaMsg, mediaType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk]);
        }

        // Tentukan ekstensi & mime type
        let ext = 'bin';
        let mime = 'application/octet-stream';
        if (mediaType === 'image') { ext = 'jpg'; mime = 'image/jpeg'; }
        else if (mediaType === 'video') { ext = 'mp4'; mime = 'video/mp4'; }
        else if (mediaType === 'audio') { ext = 'mp3'; mime = 'audio/mp3'; }
        else if (mediaType === 'sticker') { ext = 'webp'; mime = 'image/webp'; }
        else if (mediaType === 'document') {
          ext = mediaMsg.fileName?.split('.').pop() || 'bin';
          mime = mediaMsg.mimetype || 'application/octet-stream';
        }

        // Upload ke tmpfiles.org menggunakan native fetch & FormData
        const blob = new Blob([buffer], { type: mime });
        const formData = new FormData();
        formData.append('file', blob, `file.${ext}`);

        const uploadRes = await fetch('https://tmpfiles.org/api/v1/upload', {
          method: 'POST',
          body: formData
        });
        const uploadJson = await uploadRes.json();

        if (uploadJson.status !== 'success' || !uploadJson.data?.url) {
          throw new Error('Gagal mengupload file ke hosting.');
        }

        // Ubah link agar langsung download/view
        dataText = uploadJson.data.url.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
      }

      if (!dataText) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
        return await sock.sendMessage(from, { 
          text: '❌ Masukkan teks/link, atau kirim/reply media (foto/video/audio/dokumen) dengan perintah *!qr*!' 
        }, { quoted: msg });
      }

      // Buat QR Code
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(dataText)}`;
      
      const response = await axios.get(qrUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data, 'binary');

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
      await sock.sendMessage(from, { 
        image: buffer, 
        caption: `🤖 *QR Code Generator*\n\n◦ *Data:* ${dataText}\n\n_${mediaType ? `(QR Code berisi link ${mediaType} Anda. Link aktif selama 60 menit)` : ''}_` 
      }, { quoted: msg });

    } catch (err) {
      console.error('Error generating QR:', err);
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      await sock.sendMessage(from, { text: `❌ Gagal membuat QR Code.\n_${err.message}_` }, { quoted: msg });
    }
  }
};

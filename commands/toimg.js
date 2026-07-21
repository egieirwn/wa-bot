const { downloadContentFromMessage, downloadMediaMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');

/**
 * Mengunduh buffer stiker dengan multi-strategy fallback (termasuk stiker lama/expired).
 */
async function getStickerBuffer(sock, msg, quotedMsg, stickerMsg) {
  // Strategy 1: Direct stream download (Paling cepat, sukses untuk stiker baru/CDN aktif)
  try {
    const stream = await downloadContentFromMessage(stickerMsg, 'sticker');
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    if (buffer && buffer.length > 0) {
      return buffer;
    }
  } catch (err1) {
    console.log('[toimg] Strategy 1 (Direct Stream) failed:', err1.message);
  }

  // Strategy 2: Gunakan downloadMediaMessage dengan reuploadRequest (Untuk stiker lama dengan CDN link expired)
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  const from = msg.key.remoteJid;
  const isGroup = from.endsWith('@g.us');
  const stanzaId = contextInfo?.stanzaId || msg.key.id;
  const participant = contextInfo?.participant;
  const botJidNum = sock.user?.id?.split(':')[0] || '';
  const isFromMe = participant ? participant.includes(botJidNum) : !!msg.key.fromMe;

  const targetMsg = {
    key: {
      remoteJid: from,
      fromMe: isFromMe,
      id: stanzaId,
      ...(isGroup && participant ? { participant } : {})
    },
    message: quotedMsg || msg.message
  };

  try {
    const buffer = await downloadMediaMessage(
      targetMsg,
      'buffer',
      {},
      { reuploadRequest: sock.updateMediaMessage }
    );
    if (buffer && buffer.length > 0) {
      return buffer;
    }
  } catch (err2) {
    console.log('[toimg] Strategy 2 (downloadMediaMessage) failed:', err2.message);
  }

  // Strategy 3: Minta WhatsApp server me-reupload link secara eksplisit, lalu baca stream-nya
  try {
    const updatedMsg = await sock.updateMediaMessage(targetMsg);
    const freshSticker = updatedMsg?.message?.stickerMessage || updatedMsg?.stickerMessage || stickerMsg;
    const stream = await downloadContentFromMessage(freshSticker, 'sticker');
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    if (buffer && buffer.length > 0) {
      return buffer;
    }
  } catch (err3) {
    console.log('[toimg] Strategy 3 (updateMediaMessage + stream) failed:', err3.message);
  }

  throw new Error('Stiker lama tidak dapat diunduh dari WhatsApp CDN.');
}

module.exports = {
  name: 'toimg',
  description: 'Mengubah stiker menjadi gambar biasa (PNG/GIF). Caranya: Reply stiker dengan teks *!toimg*',
  async execute(sock, msg, from, args) {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const stickerMsg = quotedMsg?.stickerMessage || msg.message?.stickerMessage;

    if (!stickerMsg) {
      return await sock.sendMessage(
        from, 
        { text: '❌ *Perintah Gagal!*\nSilakan balas (reply) stiker yang ingin diubah menjadi gambar dengan mengetik *!toimg*.' }, 
        { quoted: msg }
      );
    }

    try {
      await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

      // Unduh buffer stiker (mendukung stiker baru maupun stiker lama)
      const buffer = await getStickerBuffer(sock, msg, quotedMsg, stickerMsg);

      if (!buffer || buffer.length === 0) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
        return await sock.sendMessage(from, { text: '❌ Gagal mengunduh stiker dari server WhatsApp.' }, { quoted: msg });
      }

      // Deteksi metadata stiker (apakah bergerak/animasi)
      let isAnimated = false;
      try {
        const metadata = await sharp(buffer, { animated: true }).metadata();
        isAnimated = (metadata.pages || 1) > 1;
      } catch (e) {
        isAnimated = false;
      }

      if (isAnimated) {
        try {
          // Konversi stiker bergerak ke GIF
          const gifBuffer = await sharp(buffer, { animated: true })
            .gif()
            .toBuffer();

          await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
          return await sock.sendMessage(
            from, 
            { video: gifBuffer, gifPlayback: true, caption: '✨ *Stiker Bergerak berhasil diubah ke GIF!*' }, 
            { quoted: msg }
          );
        } catch (gifErr) {
          console.log('[toimg] Gagal konversi GIF, mencoba konversi ke PNG...', gifErr.message);
        }
      }

      // Konversi stiker biasa (atau fallback stiker bergerak) ke PNG
      const pngBuffer = await sharp(buffer)
        .png()
        .toBuffer();

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
      return await sock.sendMessage(
        from, 
        { image: pngBuffer, caption: '✨ *Stiker berhasil diubah ke gambar PNG!*' }, 
        { quoted: msg }
      );

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

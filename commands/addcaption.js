const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');

// Escape karakter khusus untuk Pango markup (XML-based)
function escapePango(unsafe) {
    if (!unsafe) return '';
    return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case "'": return '&apos;';
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
      // Buat fake WAMessage untuk quoted message agar downloadMediaMessage bisa mendownload menggunakan MediaConn
      const { downloadMediaMessage } = require('@whiskeysockets/baileys');
      const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
      const fakeMsg = {
        key: {
          remoteJid: from,
          fromMe: msg.key.fromMe,
          id: contextInfo?.stanzaId,
          participant: contextInfo?.participant
        },
        message: quoted
      };

      // Download stiker dengan downloadMediaMessage
      const buffer = await downloadMediaMessage(
        fakeMsg,
        'buffer',
        {},
        {
          reuploadRequest: sock.updateMediaMessage
        }
      );

      // Ambil dimensi stiker (mendukung animasi)
      const metadata = await sharp(buffer, { animated: true }).metadata();
      const width = metadata.width || 512;
      const height = metadata.pageHeight || metadata.height || 512;
      const pages = metadata.pages || 1;
      const isAnimated = pages > 1;

      // Ukuran font dalam poin, lalu konversi ke Pango units (1 pt = 1024 Pango units)
      const fontPt = Math.max(24, Math.floor(width * 0.10));
      const pangoSize = fontPt * 1024;
      const outlineOffset = Math.max(2, Math.floor(fontPt * 0.12));

      const safeText = escapePango(text);

      // Buat teks putih menggunakan Pango (bawaan libvips/sharp, jauh lebih reliable daripada SVG)
      const whiteTextBuf = await sharp({
        text: {
          text: `<span foreground="white" size="${pangoSize}"><b>${safeText}</b></span>`,
          rgba: true,
          width: width - 20,
          align: 'centre',
        }
      }).png().toBuffer();

      // Buat teks hitam untuk outline
      const blackTextBuf = await sharp({
        text: {
          text: `<span foreground="black" size="${pangoSize}"><b>${safeText}</b></span>`,
          rgba: true,
          width: width - 20,
          align: 'centre',
        }
      }).png().toBuffer();

      // Hitung posisi teks (bawah tengah dengan margin kecil)
      const textMeta = await sharp(whiteTextBuf).metadata();
      const tw = textMeta.width || 100;
      const th = textMeta.height || 30;
      const baseLeft = Math.max(0, Math.floor((width - tw) / 2));
      const baseTop = Math.max(0, height - th - 10);

      // Buat efek outline dengan menempelkan teks hitam di 8 arah
      const composites = [];
      const directions = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
      for (const [dx, dy] of directions) {
        composites.push({
          input: blackTextBuf,
          top: Math.max(0, baseTop + dy * outlineOffset),
          left: Math.max(0, baseLeft + dx * outlineOffset),
          animated: isAnimated,
        });
      }
      // Teks putih di tengah (paling atas/depan)
      composites.push({
        input: whiteTextBuf,
        top: baseTop,
        left: baseLeft,
        animated: isAnimated,
      });

      // Tempelkan semua layer teks ke stiker
      const finalBuffer = await sharp(buffer, { animated: true })
        .composite(composites)
        .webp({ quality: 80, effort: 6 })
        .toBuffer();

      await sock.sendMessage(from, { sticker: finalBuffer }, { quoted: msg });

    } catch (err) {
      console.error('Error addcaption:', err);
      await sock.sendMessage(from, { text: `❌ Terjadi kesalahan saat memproses stiker:\n_${err.message}_` }, { quoted: msg });
    }
  }
};

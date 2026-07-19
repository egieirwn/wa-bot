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

function wrapText(text, maxCharsPerLine) {
  const words = text.split(/\s+/); // Memisahkan spasi dan enter
  const lines = [];
  let currentLine = words[0] || '';

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    if (currentLine.length + word.length + 1 <= maxCharsPerLine) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

module.exports = {
  name: 'tosticker',
  description: 'Ubah pesan teks yang di-reply menjadi stiker (teks -> stiker)',
  execute: async (sock, msg, from, args) => {
    // Cari teks dari pesan yang di-reply, atau dari argumen langsung
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    
    let textToSticker = '';
    
    // Jika mereply pesan orang lain/diri sendiri, ambil teks secara aman dari berbagai kemungkinan jenis pesan WA
    if (quotedMsg) {
      textToSticker = quotedMsg.conversation || 
                      quotedMsg.extendedTextMessage?.text || 
                      quotedMsg.imageMessage?.caption || 
                      quotedMsg.videoMessage?.caption || 
                      '';
    }
    
    // Jika tidak mereply, ambil teks dari argumen langsung (misal: !tosticker Halo malam)
    if (!textToSticker && args.length > 0) {
      // Jika argumen pertamanya adalah "sticker" (contoh penulisan: !to sticker Teks), kita hapus kata sticker-nya
      if (args[0].toLowerCase() === 'sticker') {
          args.shift();
      }
      textToSticker = args.join(' ');
    }

    if (!textToSticker || textToSticker.trim() === '') {
      return await sock.sendMessage(from, { text: '❌ Silakan *reply* sebuah pesan teks dan ketik *!tosticker*, atau langsung ketik *!tosticker teksnya*.' }, { quoted: msg });
    }

    await sock.sendMessage(from, { text: '⏳ Sedang meracik stiker teks...' }, { quoted: msg });

    try {
      // Batasi panjang teks agar font tidak terlalu kekecilan
      if (textToSticker.length > 250) {
         textToSticker = textToSticker.substring(0, 247) + '...';
      }

      // Pecah teks menjadi baris-baris (15 huruf per baris agar rapi)
      const lines = wrapText(textToSticker, 15);
      
      // Ukuran font dinamis menyesuaikan jumlah baris
      let fontSize = 64;
      if (lines.length > 3) fontSize = 48;
      if (lines.length > 5) fontSize = 36;
      if (lines.length > 8) fontSize = 28;
      if (lines.length > 12) fontSize = 20;

      const lineHeight = fontSize * 1.3;
      const totalHeight = lines.length * lineHeight;
      const startY = (512 - totalHeight) / 2 + (fontSize / 2);

      let tspans = '';
      lines.forEach((line, index) => {
        // x=256 karena 256 adalah titik tengah dari 512px (text-anchor=middle)
        tspans += `<tspan x="256" y="${startY + (index * lineHeight)}">${escapeXml(line)}</tspan>`;
      });

      // Template SVG background putih dan teks hitam
      const svgImage = `
        <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="white"/>
          <text text-anchor="middle" dominant-baseline="central" style="font-family: Arial; font-size: ${fontSize}px; font-weight: normal;" fill="black">
            ${tspans}
          </text>
        </svg>
      `;

      // Konversi SVG ke format WebP (standar Stiker WA)
      const webp = await sharp(Buffer.from(svgImage))
        .webp()
        .toBuffer();

      // Kirim hasil akhir stiker
      await sock.sendMessage(from, { sticker: webp }, { quoted: msg });

    } catch (err) {
      console.error('Error tosticker:', err);
      await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat memproses gambar teks menjadi stiker.' }, { quoted: msg });
    }
  }
};

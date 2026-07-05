const gis = require('g-i-s');
const axios = require('axios');
const sharp = require('sharp');

module.exports = {
  name: 'getsticker',
  description: 'Mencari gambar di Google dan otomatis menjadikannya stiker (mendukung gif). Contoh: !getsticker patrick sedih',
  async execute(sock, msg, from, args) {
    const query = args.join(' ');
    if (!query) {
      return await sock.sendMessage(from, { text: '❌ Masukkan kata kunci pencarian stiker!\nContoh: *!getsticker spongebob*' }, { quoted: msg });
    }

    try {
      await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

      gis(query, async (error, results) => {
        if (error || !results || results.length === 0) {
          await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
          return await sock.sendMessage(from, { text: '❌ Gagal menemukan gambar untuk kata kunci tersebut.' }, { quoted: msg });
        }

        // Ambil 15 hasil teratas untuk diuji satu-satu (menghindari link mati)
        const limit = Math.min(15, results.length);
        const topResults = results.slice(0, limit);
        
        let buffer = null;
        let successUrl = '';

        for (const res of topResults) {
          try {
            const response = await axios.get(res.url, { 
              responseType: 'arraybuffer', 
              timeout: 6000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            });
            buffer = Buffer.from(response.data, 'binary');
            successUrl = res.url;
            break; // Jika berhasil download, keluar dari loop
          } catch (e) {
            // Jika gagal, coba url berikutnya
            console.log(`Gagal mengunduh gambar dari ${res.url}, mencoba alternatif...`);
          }
        }

        if (!buffer) {
          await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
          return await sock.sendMessage(from, { text: '❌ Semua gambar hasil pencarian tidak dapat diunduh (blokir CDN / link mati).' }, { quoted: msg });
        }

        try {
          // Deteksi metadata gambar (apakah gif/animasi)
          const metadata = await sharp(buffer, { animated: true }).metadata();
          const pages = metadata.pages || 1;
          const isAnimated = pages > 1;

          // Konversi ke stiker WebP (512x512 transparan)
          const webp = await sharp(buffer, { animated: isAnimated })
            .resize(512, 512, {
              fit: 'contain',
              background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .webp({ quality: 80 })
            .toBuffer();

          await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
          await sock.sendMessage(from, { sticker: webp }, { quoted: msg });

        } catch (err) {
          console.error('Error processing sticker:', err);
          await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
          await sock.sendMessage(from, { text: '❌ Gagal memproses gambar tersebut menjadi stiker.' }, { quoted: msg });
        }
      });

    } catch (err) {
      console.error('Error getsticker:', err);
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      await sock.sendMessage(from, { text: `❌ Terjadi kesalahan.\n_${err.message}_` }, { quoted: msg });
    }
  }
};

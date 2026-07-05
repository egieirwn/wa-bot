const axios = require('axios');
const sharp = require('sharp');

// Fungsi Scraper Bing Image Search (100% Gratis, Stabil & Keyless)
async function searchBingImages(query) {
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}`;
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  const html = response.data;
  // Ekstrak URL gambar asli dari atribut murl
  const matches = [...html.matchAll(/&quot;murl&quot;:&quot;(http[^&]+)&quot;/g)].map(m => m[1]);
  return matches;
}

module.exports = {
  name: 'getsticker',
  description: 'Mencari gambar di internet dan otomatis menjadikannya stiker. Contoh: !getsticker patrick sedih',
  async execute(sock, msg, from, args) {
    const query = args.join(' ');
    if (!query) {
      return await sock.sendMessage(from, { text: '❌ Masukkan kata kunci pencarian stiker!\nContoh: *!getsticker spongebob*' }, { quoted: msg });
    }
    // Bersihkan kata-kata tambahan seperti "lainnya", "yang lain", "lain", "baru" untuk pencarian yang lebih luas
    const cleanQuery = query.replace(/(yang\s+)?lain(nya)?/gi, '').replace(/\bbaru\b/gi, '').replace(/\brandom\b/gi, '').replace(/\bacak\b/gi, '').trim() || query;

    try {
      await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

      const results = await searchBingImages(cleanQuery);
      if (!results || results.length === 0) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
        return await sock.sendMessage(from, { text: '❌ Gagal menemukan gambar untuk kata kunci tersebut.' }, { quoted: msg });
      }

      // Ambil 30 hasil teratas, lalu acak urutannya (shuffle) agar bervariasi setiap dipanggil
      const shuffledResults = results.slice(0, 30).sort(() => Math.random() - 0.5);
      
      let buffer = null;
      let successUrl = '';

      for (const imageUrl of shuffledResults) {
        try {
          const response = await axios.get(imageUrl, { 
            responseType: 'arraybuffer', 
            timeout: 6000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          buffer = Buffer.from(response.data, 'binary');
          successUrl = imageUrl;
          break; // Jika berhasil download, keluar dari loop
        } catch (e) {
          // Jika gagal, coba url berikutnya
          console.log(`Gagal mengunduh gambar dari ${imageUrl}, mencoba alternatif...`);
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

    } catch (err) {
      console.error('Error getsticker:', err);
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      await sock.sendMessage(from, { text: `❌ Terjadi kesalahan.\n_${err.message}_` }, { quoted: msg });
    }
  }
};

const { igdl } = require('btch-downloader');

module.exports = {
  name: 'ig',
  description: 'Download foto/video Instagram. Contoh: !ig https://www.instagram.com/reel/xxx',
  async execute(sock, msg, from, args) {
    const url = args[0] || '';

    if (!url) {
      return await sock.sendMessage(from, { text: '❌ Masukkan URL Instagram.\nContoh: *!ig https://www.instagram.com/reel/xxx*' }, { quoted: msg });
    }

    const igRegex = /^https?:\/\/(www\.)?instagram\.com\/.+/i;
    if (!igRegex.test(url)) {
      return await sock.sendMessage(from, { text: '❌ URL Instagram tidak valid.' }, { quoted: msg });
    }

    await sock.sendMessage(from, { text: '⏳ Sedang mengunduh media dari Instagram, mohon tunggu...' }, { quoted: msg });

    try {
      const data = await igdl(url);
      
      if (!data || !data.status || !data.result || data.result.length === 0) {
          return await sock.sendMessage(from, { text: '❌ Gagal mengunduh. Video mungkin diprivate atau link tidak valid.' }, { quoted: msg });
      }

      // Loop semua hasil (karena IG Post bisa berisi banyak slide foto/video)
      for (const media of data.result) {
          if (media.url.includes('.mp4') || media.url.includes('dl=1')) {
              await sock.sendMessage(from, { 
                  video: { url: media.url }, 
                  caption: '✅ *Berhasil diunduh*' 
              }, { quoted: msg });
          } else {
              await sock.sendMessage(from, { 
                  image: { url: media.url }, 
                  caption: '✅ *Berhasil diunduh*' 
              }, { quoted: msg });
          }
      }

    } catch (err) {
      console.error('Error ig:', err);
      await sock.sendMessage(from, { text: '❌ Terjadi kesalahan pada server saat mengunduh dari Instagram.' }, { quoted: msg });
    }
  }
};

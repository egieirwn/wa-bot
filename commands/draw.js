const axios = require('axios');

module.exports = {
  name: 'draw',
  description: 'Membuat gambar menggunakan kecerdasan buatan (AI). Contoh: !draw kucing naik motor',
  async execute(sock, msg, from, args) {
    const prompt = args.join(' ');
    if (!prompt) {
      return await sock.sendMessage(from, { text: '❌ Masukkan deskripsi gambar yang ingin dibuat!\nContoh: *!draw astronot di planet mars*' }, { quoted: msg });
    }

    const processMsg = await sock.sendMessage(from, { text: `🎨 Sedang menggambar *"${prompt}"* menggunakan AI...` }, { quoted: msg });

    try {
      await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });

      // Pollinations AI endpoint (Free, fast & keyless)
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&private=true&enhance=true`;
      
      const response = await axios.get(url, { 
        responseType: 'arraybuffer',
        timeout: 30000 // 30 detik timeout karena AI butuh waktu generate
      });
      
      const buffer = Buffer.from(response.data, 'binary');

      // Edit pesan loading menjadi selesai
      try {
        await sock.sendMessage(from, { 
          text: `✅ Selesai menggambar *"${prompt}"*!`,
          edit: processMsg.key
        });
      } catch (e) {
        // Abaikan jika gagal edit
      }

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
      await sock.sendMessage(from, { 
        image: buffer, 
        caption: `🤖 *AI Image Generator*\n\n◦ *Prompt:* ${prompt}`
      }, { quoted: msg });

    } catch (err) {
      console.error('Error draw:', err);
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      try {
        await sock.sendMessage(from, { 
          text: `❌ Gagal membuat gambar.\n_${err.message}_`,
          edit: processMsg.key
        });
      } catch (e) {
        await sock.sendMessage(from, { text: `❌ Gagal membuat gambar.\n_${err.message}_` }, { quoted: msg });
      }
    }
  }
};

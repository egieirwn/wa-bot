const axios = require('axios');

module.exports = {
  name: 'stalkig',
  description: 'Melihat info profil Instagram seseorang. Contoh: !stalkig sandhikagalih',
  async execute(sock, msg, from, args) {
    const username = args[0];
    if (!username) {
      return await sock.sendMessage(from, { text: '❌ Masukkan username Instagram yang ingin distalk!\nContoh: *!stalkig sandhikagalih*' }, { quoted: msg });
    }

    const processMsg = await sock.sendMessage(from, { text: `🔍 Sedang mencari profil Instagram *@${username}...*` }, { quoted: msg });

    try {
      await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });

      const url = `https://imginn.com/${encodeURIComponent(username)}/`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      const html = response.data;

      // Parse Imginn HTML
      const avatarMatch = html.match(/<div class="img">[\s\S]*?<img[^>]*src="([^"]+)"/);
      const nameMatch = html.match(/<div class="name">[\s\S]*?<h1>([^<]+)<\/h1>/);
      const bioMatch = html.match(/<div class="bio">([\s\S]*?)<\/div>/);
      
      const statsMatch = [...html.matchAll(/<div class="num">([^<]+)<\/div>\s*<span>([^<]+)<\/span>/g)].map(m => ({
        num: m[1],
        label: m[2]
      }));

      if (!nameMatch) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
        return await sock.sendMessage(from, { 
          text: `❌ Gagal menemukan profil Instagram *@${username}*.\n_Username tidak ditemukan atau profil di-private._`,
          edit: processMsg.key
        });
      }

      // Bersihkan Bio dari HTML tags (seperti <br>, <a>, dll)
      const cleanBio = bioMatch ? bioMatch[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() : '';

      // Tentukan statistik
      let posts = '0';
      let followers = '0';
      let following = '0';

      for (const stat of statsMatch) {
        if (stat.label === 'posts') posts = stat.num;
        else if (stat.label === 'followers') followers = stat.num;
        else if (stat.label === 'following') following = stat.num;
      }

      // Bersihkan entitas HTML pada avatar URL jika ada
      let avatarUrl = avatarMatch ? avatarMatch[1].replace(/&#38;/g, '&') : '';
      let avatarBuffer = null;

      if (avatarUrl) {
        try {
          const avatarResponse = await axios.get(avatarUrl, { 
            responseType: 'arraybuffer',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          avatarBuffer = Buffer.from(avatarResponse.data, 'binary');
        } catch (e) {
          console.warn('Gagal mendownload avatar:', e.message);
        }
      }

      const caption = `📸 *INSTAGRAM PROFILE STALKER*\n` +
                      `━━━━━━━━━━━━━━━━━━\n\n` +
                      `◦ *Nama:* ${nameMatch[1].trim()}\n` +
                      `◦ *Username:* @${username}\n` +
                      `◦ *Bio:* \n${cleanBio || '(tidak ada bio)'}\n\n` +
                      `📊 *Statistik:* \n` +
                      `◦ *Postingan:* ${posts}\n` +
                      `◦ *Pengikut:* ${followers}\n` +
                      `◦ *Mengikuti:* ${following}`;

      // Edit loading message
      try {
        await sock.sendMessage(from, { 
          text: `✅ Berhasil menemukan profil *@${username}*!`,
          edit: processMsg.key
        });
      } catch (e) {}

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
      
      if (avatarBuffer) {
        await sock.sendMessage(from, { image: avatarBuffer, caption }, { quoted: msg });
      } else {
        await sock.sendMessage(from, { text: caption }, { quoted: msg });
      }

    } catch (err) {
      console.error('Error stalkig:', err);
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      try {
        await sock.sendMessage(from, { 
          text: `❌ Gagal memproses data stalk Instagram.\n_${err.message}_`,
          edit: processMsg.key
        });
      } catch (e) {
        await sock.sendMessage(from, { text: `❌ Gagal memproses data stalk Instagram.\n_${err.message}_` }, { quoted: msg });
      }
    }
  }
};

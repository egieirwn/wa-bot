const axios = require('axios');

module.exports = {
  name: 'stalkgh',
  description: 'Melihat info profil GitHub seseorang. Contoh: !stalkgh torvalds',
  async execute(sock, msg, from, args) {
    const username = args[0];
    if (!username) {
      return await sock.sendMessage(from, { text: '❌ Masukkan username GitHub yang ingin distalk!\nContoh: *!stalkgh torvalds*' }, { quoted: msg });
    }

    const processMsg = await sock.sendMessage(from, { text: `🔍 Sedang mencari profil GitHub *@${username}...*` }, { quoted: msg });

    try {
      await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });

      const url = `https://api.github.com/users/${encodeURIComponent(username)}`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'JarvisWhatsAppBot/1.0'
        }
      });
      const user = response.data;

      // Download avatar image
      const avatarResponse = await axios.get(user.avatar_url, { responseType: 'arraybuffer' });
      const avatarBuffer = Buffer.from(avatarResponse.data, 'binary');

      const caption = `🐙 *GITHUB PROFILE STALKER*\n` +
                      `━━━━━━━━━━━━━━━━━━\n\n` +
                      `◦ *Nama:* ${user.name || '(tidak ada nama)'}\n` +
                      `◦ *Username:* @${user.login}\n` +
                      `◦ *Bio:* ${user.bio || '(tidak ada bio)'}\n` +
                      `◦ *Lokasi:* ${user.location || '(tidak diketahui)'}\n` +
                      `◦ *Perusahaan:* ${user.company || '(tidak ada)'}\n` +
                      `◦ *Website:* ${user.blog || '(tidak ada)'}\n\n` +
                      `📊 *Statistik:* \n` +
                      `◦ *Public Repos:* ${user.public_repos}\n` +
                      `◦ *Public Gists:* ${user.public_gists}\n` +
                      `◦ *Pengikut:* ${user.followers.toLocaleString('id-ID')}\n` +
                      `◦ *Mengikuti:* ${user.following.toLocaleString('id-ID')}\n\n` +
                      `🔗 *Link Profil:* https://github.com/${user.login}`;

      // Edit loading message
      try {
        await sock.sendMessage(from, { 
          text: `✅ Berhasil menemukan profil *@${username}*!`,
          edit: processMsg.key
        });
      } catch (e) {}

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
      await sock.sendMessage(from, { image: avatarBuffer, caption }, { quoted: msg });

    } catch (err) {
      console.error('Error stalkgh:', err);
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      try {
        await sock.sendMessage(from, { 
          text: `❌ Gagal memproses data stalk.\n_${err.response?.status === 404 ? 'Username tidak ditemukan' : err.message}_`,
          edit: processMsg.key
        });
      } catch (e) {
        await sock.sendMessage(from, { text: `❌ Gagal memproses data stalk.\n_${err.message}_` }, { quoted: msg });
      }
    }
  }
};

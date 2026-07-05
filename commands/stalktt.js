const axios = require('axios');

module.exports = {
  name: 'stalktt',
  description: 'Melihat info profil TikTok seseorang. Contoh: !stalktt khaby.lame',
  async execute(sock, msg, from, args) {
    const username = args[0];
    if (!username) {
      return await sock.sendMessage(from, { text: '❌ Masukkan username TikTok yang ingin distalk!\nContoh: *!stalktt khaby.lame*' }, { quoted: msg });
    }

    const processMsg = await sock.sendMessage(from, { text: `🔍 Sedang mencari profil TikTok *@${username}...*` }, { quoted: msg });

    try {
      await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });

      const url = `https://tikwm.com/api/user/info?unique_id=${encodeURIComponent(username)}`;
      const response = await axios.get(url);
      const data = response.data;

      if (data.code !== 0 || !data.data) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
        return await sock.sendMessage(from, { 
          text: `❌ Gagal menemukan profil TikTok *@${username}*.\n_${data.msg || 'User tidak ditemukan'}_`,
          edit: processMsg.key
        });
      }

      const user = data.data.user;
      const stats = data.data.stats;

      // Download avatar image
      const avatarResponse = await axios.get(user.avatarLarger, { responseType: 'arraybuffer' });
      const avatarBuffer = Buffer.from(avatarResponse.data, 'binary');

      const caption = `👥 *TIKTOK PROFILE STALKER*\n` +
                      `━━━━━━━━━━━━━━━━━━\n\n` +
                      `◦ *Nama:* ${user.nickname}\n` +
                      `◦ *Username:* @${user.uniqueId}\n` +
                      `◦ *Verified:* ${user.verified ? '✅ Ya' : '❌ Tidak'}\n` +
                      `◦ *Bio:* ${user.signature || '(tidak ada bio)'}\n\n` +
                      `📊 *Statistik:* \n` +
                      `◦ *Pengikut:* ${stats.followerCount.toLocaleString('id-ID')}\n` +
                      `◦ *Mengikuti:* ${stats.followingCount.toLocaleString('id-ID')}\n` +
                      `◦ *Total Suka:* ${stats.heartCount.toLocaleString('id-ID')}\n` +
                      `◦ *Jumlah Video:* ${stats.videoCount.toLocaleString('id-ID')}`;

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
      console.error('Error stalktt:', err);
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      try {
        await sock.sendMessage(from, { 
          text: `❌ Gagal memproses data stalk.\n_${err.message}_`,
          edit: processMsg.key
        });
      } catch (e) {
        await sock.sendMessage(from, { text: `❌ Gagal memproses data stalk.\n_${err.message}_` }, { quoted: msg });
      }
    }
  }
};

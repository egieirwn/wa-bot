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

      let name = '';
      let bio = '';
      let followers = '0';
      let following = '0';
      let posts = '0';
      let avatarUrl = '';
      let exists = false;

      // Helper function to decode HTML entities including unicode
      function decodeHtmlEntities(str) {
        if (!str) return '';
        return str
          .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
          .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&middot;/g, '·');
      }

      // 1. Fetch Instagram page using Discordbot User-Agent
      try {
        const res = await axios.get(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
          },
          timeout: 10000
        });

        const html = res.data;
        
        // Extract Desc (Followers, Following, Posts)
        const descMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/) ||
                          html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:description"/);

        if (descMatch) {
          exists = true;
          const desc = decodeHtmlEntities(descMatch[1]);
          const followersMatch = desc.match(/([0-9.,KMB]+)\s*Followers/i);
          const followingMatch = desc.match(/([0-9.,KMB]+)\s*Following/i);
          const postsMatch = desc.match(/([0-9.,KMB]+)\s*Posts/i);

          if (followersMatch) followers = followersMatch[1];
          if (followingMatch) following = followingMatch[1];
          if (postsMatch) posts = postsMatch[1];
        }

        // Extract Title for Name
        const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/) ||
                           html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:title"/) ||
                           html.match(/<title>([^<]+)<\/title>/);
        if (titleMatch) {
          const fullTitle = decodeHtmlEntities(titleMatch[1]);
          if (fullTitle !== 'Instagram') {
            const namePart = fullTitle.split('(')[0].trim();
            name = namePart.replace(/•/g, '').trim();
          }
        }

        // Extract Image (use as-is, CDN URLs are signed and cannot be modified)
        const imageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/) ||
                           html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/);
        if (imageMatch) {
          avatarUrl = decodeHtmlEntities(imageMatch[1]);
        }

        // Extract Bio from meta name="description" tag
        // Format: "N Followers, N Following, N Posts - Name (@user) on Instagram: "bio here""
        const metaDescMatch = html.match(/<meta[^>]*content="([^"]*)"[^>]*name="description"/) ||
                              html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/);
        if (metaDescMatch) {
          const metaDesc = decodeHtmlEntities(metaDescMatch[1]);
          const bioExtract = metaDesc.match(/on Instagram:\s*"([\s\S]*)"$/);
          if (bioExtract && bioExtract[1]) {
            bio = bioExtract[1].trim();
          }
        }
      } catch (err) {
        console.warn('Instagram page fetch failed:', err.message);
      }

      // 2. Fetch Threads for bio & backup details
      try {
        const threadsRes = await axios.get(`https://api.siputzx.my.id/api/stalk/threads?q=${encodeURIComponent(username)}`, { timeout: 8000 });
        if (threadsRes.data && threadsRes.data.status && threadsRes.data.data) {
          const t = threadsRes.data.data;
          if (t.bio && !bio) bio = t.bio;
          if (t.name && !name) name = t.name;
          // Prefer Threads HD profile picture (s320x320) over og:image (s100x100)
          if (t.hd_profile_picture) avatarUrl = t.hd_profile_picture;
          exists = true; // If threads data found, the user definitely exists
        }
      } catch (err) {
        console.warn('Threads stalk failed or user has no Threads account:', err.message);
      }

      // If we couldn't find any indicators that the profile exists
      if (!exists && !name) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
        return await sock.sendMessage(from, { 
          text: `❌ Gagal menemukan profil Instagram *@${username}*.\n_Username tidak ditemukan atau profil di-private._`,
          edit: processMsg.key
        });
      }

      if (!name) name = username;

      // Download avatar if available
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
                      `◦ *Nama:* ${name}\n` +
                      `◦ *Username:* @${username}\n` +
                      `◦ *Bio:* \n${bio || '(tidak ada bio)'}\n\n` +
                      `📊 *Statistik:* \n` +
                      `◦ *Postingan:* ${posts}\n` +
                      `◦ *Pengikut:* ${followers}\n` +
                      `◦ *Mengikuti:* ${following}\n\n` +
                      `🔗 *Link Profil:* https://instagram.com/${username}`;

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
      
      let errMsg = err.message;
      if (err.response?.status === 410 || err.response?.status === 404) {
        errMsg = 'Username tidak ditemukan, akun tersebut bersifat PRIVAT (dikunci), atau belum pernah di-index oleh web viewer.';
      }

      try {
        await sock.sendMessage(from, { 
          text: `❌ Gagal memproses data stalk Instagram.\n_${errMsg}_`,
          edit: processMsg.key
        });
      } catch (e) {
        await sock.sendMessage(from, { text: `❌ Gagal memproses data stalk Instagram.\n_${errMsg}_` }, { quoted: msg });
      }
    }
  }
};

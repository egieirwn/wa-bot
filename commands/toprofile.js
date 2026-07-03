const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'toprofile',
  description: 'Mengubah foto profil grup. Balas pesan gambar dengan !toprofile',
  async execute(sock, msg, from, args) {
    const isGroup = from.endsWith('@g.us');
    if (!isGroup) {
      return await sock.sendMessage(from, { text: '❌ Command ini hanya bisa digunakan di dalam Grup.' }, { quoted: msg });
    }

    try {
      const groupMetadata = await sock.groupMetadata(from);
      const sender = msg.key.participant || msg.key.remoteJid;
      const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';

      // Cek apakah bot adalah admin
      const botMember = groupMetadata.participants.find(p => p.id === botId);
      const isBotAdmin = botMember?.admin === 'admin' || botMember?.admin === 'superadmin';
      if (!isBotAdmin) {
        return await sock.sendMessage(from, { text: '❌ Bot harus menjadi admin grup terlebih dahulu untuk bisa mengubah foto grup!' }, { quoted: msg });
      }

      // Cek apakah user yang memerintah adalah admin
      const senderMember = groupMetadata.participants.find(p => p.id === sender);
      const isSenderAdmin = senderMember?.admin === 'admin' || senderMember?.admin === 'superadmin';
      if (!isSenderAdmin && !msg.key.fromMe) {
        return await sock.sendMessage(from, { text: '❌ Hanya admin grup yang bisa menggunakan command ini!' }, { quoted: msg });
      }

      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const imageMsg = quotedMsg?.imageMessage;

      if (!imageMsg) {
        return await sock.sendMessage(from, { text: '❌ Anda harus me-reply (membalas) sebuah foto dengan command *!toprofile*' }, { quoted: msg });
      }

      await sock.sendMessage(from, { text: '⏳ Sedang mengunduh dan memasang foto profil...' }, { quoted: msg });

      // Download gambar
      const stream = await downloadContentFromMessage(imageMsg, 'image');
      let buffer = Buffer.from([]);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }
      
      // Update foto profil grup
      await sock.updateProfilePicture(from, buffer);
      
      await sock.sendMessage(from, { text: '✅ Berhasil mengubah foto profil grup.' }, { quoted: msg });

    } catch (err) {
      console.error('Error toprofile:', err);
      await sock.sendMessage(from, { text: `❌ Gagal mengubah foto profil grup.\n_${err.message}_` }, { quoted: msg });
    }
  }
};

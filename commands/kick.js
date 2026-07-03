module.exports = {
  name: 'kick',
  description: 'Mengeluarkan anggota dari grup. Balas pesan target atau tag orangnya dengan !kick',
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
        return await sock.sendMessage(from, { text: '❌ Bot harus menjadi admin grup terlebih dahulu untuk bisa mengeluarkan orang!' }, { quoted: msg });
      }

      // Cek apakah user yang memerintah adalah admin
      const senderMember = groupMetadata.participants.find(p => p.id === sender);
      const isSenderAdmin = senderMember?.admin === 'admin' || senderMember?.admin === 'superadmin';
      if (!isSenderAdmin && !msg.key.fromMe) {
        return await sock.sendMessage(from, { text: '❌ Hanya admin grup yang bisa menggunakan command ini!' }, { quoted: msg });
      }

      // Tentukan target yang akan dikick
      let targetJid = null;
      
      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.participant;
      const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

      if (quotedMsg) {
        targetJid = quotedMsg;
      } else if (mentionedJids.length > 0) {
        targetJid = mentionedJids[0];
      }

      if (!targetJid) {
        return await sock.sendMessage(from, { text: '❌ Reply pesan orang yang ingin dikeluarkan, atau tag orangnya (@nama).\nContoh: *!kick @user*' }, { quoted: msg });
      }

      // Jangan izinkan kick diri sendiri atau bot
      if (targetJid === botId) {
        return await sock.sendMessage(from, { text: '❌ Saya tidak bisa mengeluarkan diri saya sendiri!' }, { quoted: msg });
      }
      if (targetJid === sender) {
        return await sock.sendMessage(from, { text: '❌ Anda tidak bisa mengeluarkan diri sendiri dengan cara ini!' }, { quoted: msg });
      }

      await sock.sendMessage(from, { text: '⏳ Sedang mengeluarkan...' }, { quoted: msg });
      
      await sock.groupParticipantsUpdate(from, [targetJid], 'remove');
      
      await sock.sendMessage(from, { text: `✅ Berhasil mengeluarkan @${targetJid.split('@')[0]} dari grup.`, mentions: [targetJid] });

    } catch (err) {
      console.error('Error kick:', err);
      await sock.sendMessage(from, { text: `❌ Gagal mengeluarkan target. Pastikan bot adalah admin dan target valid.\n_${err.message}_` }, { quoted: msg });
    }
  }
};

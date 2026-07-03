// Helper: Normalisasi JID
function getNumber(jid) {
  if (!jid) return '';
  return jid.replace(/@.*$/, '').split(':')[0];
}

// Helper: Cari peserta berdasarkan JID (support @s.whatsapp.net dan @lid)
function findParticipant(participants, sock, jid) {
  const num = getNumber(jid);
  let found = participants.find(p => getNumber(p.id) === num);
  if (found) return found;

  // Jika JID adalah bot, coba juga dengan LID
  const botNum = getNumber(sock.user.id);
  const botLid = sock.user.lid;
  if (num === botNum && botLid) {
    const lidNum = getNumber(botLid);
    found = participants.find(p => getNumber(p.id) === lidNum);
    if (found) return found;
  }

  return null;
}

module.exports = {
  name: 'groupname',
  description: 'Mengubah nama grup. Gunakan: !groupname [nama baru]',
  hide: true,
  async execute(sock, msg, from, args) {
    const isGroup = from.endsWith('@g.us');
    if (!isGroup) {
      return await sock.sendMessage(from, { text: '❌ Command ini hanya bisa digunakan di dalam Grup.' }, { quoted: msg });
    }

    try {
      const groupMetadata = await sock.groupMetadata(from);
      const sender = msg.key.participant || msg.key.remoteJid;

      // Cek apakah bot adalah admin
      const botMember = findParticipant(groupMetadata.participants, sock, sock.user.id);
      const isBotAdmin = botMember?.admin === 'admin' || botMember?.admin === 'superadmin';
      if (!isBotAdmin) {
        return await sock.sendMessage(from, { text: '❌ Bot harus menjadi admin grup terlebih dahulu untuk bisa mengubah nama grup!' }, { quoted: msg });
      }

      // Cek apakah user yang memerintah adalah admin
      const senderMember = groupMetadata.participants.find(p => getNumber(p.id) === getNumber(sender));
      const isSenderAdmin = senderMember?.admin === 'admin' || senderMember?.admin === 'superadmin';
      if (!isSenderAdmin && !msg.key.fromMe) {
        return await sock.sendMessage(from, { text: '❌ Hanya admin grup yang bisa menggunakan command ini!' }, { quoted: msg });
      }

      const newName = args.join(' ');
      if (!newName) {
        return await sock.sendMessage(from, { text: '❌ Masukkan nama grup yang baru!\nContoh: *!groupname Grup Keren*' }, { quoted: msg });
      }

      if (newName.length > 25) {
        return await sock.sendMessage(from, { text: '❌ Nama grup terlalu panjang. Maksimal 25 karakter.' }, { quoted: msg });
      }

      await sock.sendMessage(from, { text: '⏳ Sedang mengubah nama grup...' }, { quoted: msg });
      
      await sock.groupUpdateSubject(from, newName);
      
      await sock.sendMessage(from, { text: `✅ Berhasil mengubah nama grup menjadi: *${newName}*` }, { quoted: msg });

    } catch (err) {
      console.error('Error groupname:', err);
      await sock.sendMessage(from, { text: `❌ Gagal mengubah nama grup.\n_${err.message}_` }, { quoted: msg });
    }
  }
};

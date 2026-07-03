const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

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
  name: 'toprofile',
  description: 'Mengubah foto profil grup. Balas pesan gambar dengan !toprofile',
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
        return await sock.sendMessage(from, { text: '❌ Bot harus menjadi admin grup terlebih dahulu untuk bisa mengubah foto grup!' }, { quoted: msg });
      }

      // Cek apakah user yang memerintah adalah admin
      const senderMember = groupMetadata.participants.find(p => getNumber(p.id) === getNumber(sender));
      const isSenderAdmin = senderMember?.admin === 'admin' || senderMember?.admin === 'superadmin';
      if (!isSenderAdmin && !msg.key.fromMe) {
        return await sock.sendMessage(from, { text: '❌ Hanya admin grup yang bisa menggunakan command ini!' }, { quoted: msg });
      }

      // Cek foto: langsung dikirim (caption) ATAU reply foto
      const directImage = msg.message?.imageMessage;
      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedImage = quotedMsg?.imageMessage;
      const imageMsg = directImage || quotedImage;

      if (!imageMsg) {
        return await sock.sendMessage(from, { text: '❌ Kirim foto dengan caption *!toprofile*, atau reply sebuah foto dengan *!toprofile*' }, { quoted: msg });
      }

      await sock.sendMessage(from, { text: '⏳ Sedang mengunduh dan memasang foto profil...' }, { quoted: msg });

      const stream = await downloadContentFromMessage(imageMsg, 'image');
      let buffer = Buffer.from([]);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }
      
      await sock.updateProfilePicture(from, buffer);
      
      await sock.sendMessage(from, { text: '✅ Berhasil mengubah foto profil grup.' }, { quoted: msg });

    } catch (err) {
      console.error('Error toprofile:', err);
      await sock.sendMessage(from, { text: `❌ Gagal mengubah foto profil grup.\n_${err.message}_` }, { quoted: msg });
    }
  }
};

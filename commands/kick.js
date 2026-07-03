// Helper: Normalisasi JID - ambil bagian angka saja
function getNumber(jid) {
  if (!jid) return '';
  return jid.replace(/@.*$/, '').split(':')[0];
}

// Helper: Cari peserta berdasarkan JID (support format @s.whatsapp.net dan @lid)
function findParticipant(participants, sock, jid) {
  const num = getNumber(jid);
  // Coba cocokkan langsung
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

// Helper: Cek apakah JID adalah bot
function isBot(sock, jid) {
  const num = getNumber(jid);
  if (getNumber(sock.user.id) === num) return true;
  if (sock.user.lid && getNumber(sock.user.lid) === num) return true;
  return false;
}

module.exports = {
  name: 'kick',
  description: 'Mengeluarkan anggota dari grup. Balas pesan target atau tag orangnya dengan !kick',
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
        return await sock.sendMessage(from, { text: '❌ Bot harus menjadi admin grup terlebih dahulu untuk bisa mengeluarkan orang!' }, { quoted: msg });
      }

      // Cek apakah user yang memerintah adalah admin
      const senderMember = groupMetadata.participants.find(p => getNumber(p.id) === getNumber(sender));
      const isSenderAdmin = senderMember?.admin === 'admin' || senderMember?.admin === 'superadmin';
      if (!isSenderAdmin && !msg.key.fromMe) {
        return await sock.sendMessage(from, { text: '❌ Hanya admin grup yang bisa menggunakan command ini!' }, { quoted: msg });
      }

      // Tentukan target yang akan dikick
      let targetJid = null;

      // Ambil contextInfo dari semua kemungkinan tipe pesan
      const contextInfo = msg.message?.extendedTextMessage?.contextInfo
        || msg.message?.imageMessage?.contextInfo
        || msg.message?.videoMessage?.contextInfo
        || msg.message?.stickerMessage?.contextInfo
        || msg.message?.documentMessage?.contextInfo
        || msg.message?.audioMessage?.contextInfo
        || msg.message?.conversation?.contextInfo
        || null;

      const quotedParticipant = contextInfo?.participant;
      const mentionedJids = contextInfo?.mentionedJid || [];

      if (quotedParticipant) {
        targetJid = quotedParticipant;
      } else if (mentionedJids.length > 0) {
        targetJid = mentionedJids[0];
      }

      // Fallback: coba ambil nomor dari teks pesan (misal "jarvis kick 6281234567890")
      if (!targetJid && args.length > 0) {
        const fullText = args.join(' ');
        // Cari pola nomor telepon (minimal 10 digit)
        const phoneMatch = fullText.match(/(\d{10,15})/);
        if (phoneMatch) {
          targetJid = phoneMatch[1] + '@s.whatsapp.net';
        }
      }

      if (!targetJid) {
        return await sock.sendMessage(from, { text: '❌ Reply pesan orang yang ingin dikeluarkan, atau tag orangnya (@nama).\nContoh: *!kick @user*' }, { quoted: msg });
      }

      // Cari JID yang benar dari daftar peserta grup (bisa beda format: @s.whatsapp.net vs @lid)
      const targetNumber = getNumber(targetJid);
      const targetInGroup = groupMetadata.participants.find(p => getNumber(p.id) === targetNumber);
      
      // Gunakan JID dari grup (format yang benar) jika ditemukan
      const kickJid = targetInGroup ? targetInGroup.id : targetJid;

      // Jangan izinkan kick bot sendiri
      if (isBot(sock, kickJid)) {
        return await sock.sendMessage(from, { text: '❌ Saya tidak bisa mengeluarkan diri saya sendiri!' }, { quoted: msg });
      }
      if (getNumber(kickJid) === getNumber(sender)) {
        return await sock.sendMessage(from, { text: '❌ Anda tidak bisa mengeluarkan diri sendiri dengan cara ini!' }, { quoted: msg });
      }

      if (!targetInGroup) {
        return await sock.sendMessage(from, { text: '❌ Orang tersebut tidak ditemukan di dalam grup ini.' }, { quoted: msg });
      }

      await sock.sendMessage(from, { text: '⏳ Sedang mengeluarkan...' }, { quoted: msg });
      
      await sock.groupParticipantsUpdate(from, [kickJid], 'remove');

    } catch (err) {
      console.error('Error kick:', err);
      await sock.sendMessage(from, { text: `❌ Gagal mengeluarkan target.\n_${err.message}_` }, { quoted: msg });
    }
  }
};

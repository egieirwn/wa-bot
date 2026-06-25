const userMails = {}; // Objek untuk menyimpan email sementara per pengguna

module.exports = {
  name: 'tempmail',
  description: 'Membuat email sementara (Temp-Mail) untuk menerima OTP/Verifikasi',
  execute: async (sock, msg, from, args) => {
    // Memastikan command HANYA bisa berjalan di Private Chat (Japri)
    const isGroup = from.endsWith('@g.us');
    if (isGroup) {
      return await sock.sendMessage(from, { text: '❌ *Akses Ditolak!*\n\nCommand ini bersifat privat dan berisi data sensitif. Silakan gunakan command ini di *Private Chat* (Japri) dengan bot.' }, { quoted: msg });
    }

    const action = args[0]?.toLowerCase();
    const sender = msg.key.remoteJid; // Karena ini private chat, from = sender

    // Jika tidak ada argumen atau user mengetik !tempmail help
    if (!action || action === 'help') {
      const helpText = `📧 *TEMP-MAIL GENERATOR* 📧\n\n` +
                       `Fitur untuk membuat alamat email sementara gratis untuk mendaftar akun agar terhindar dari spam.\n\n` +
                       `*Cara penggunaan:*\n` +
                       `• *!tempmail create* - Buat alamat email baru\n` +
                       `• *!tempmail inbox* - Cek kotak masuk (Inbox)\n` +
                       `• *!tempmail read <id>* - Baca isi email\n\n` +
                       `_Email Anda saat ini:_ \n${userMails[sender] ? '✅ *' + userMails[sender] + '*' : '❌ Belum ada'}`;
      return await sock.sendMessage(from, { text: helpText }, { quoted: msg });
    }

    try {
      if (action === 'create') {
        // Meminta email baru dari 1secmail API
        const response = await fetch('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1');
        const data = await response.json();
        const email = data[0];
        
        // Simpan ke memori bot
        userMails[sender] = email;
        
        await sock.sendMessage(from, { text: `✅ *Email Berhasil Dibuat!*\n\n📧 Alamat Email: \`${email}\`\n\nSilakan copy dan gunakan email ini untuk mendaftar. Jika sudah selesai, ketik *!tempmail inbox* untuk mengecek pesan masuk.` }, { quoted: msg });
      
      } else if (action === 'inbox') {
        if (!userMails[sender]) {
          return await sock.sendMessage(from, { text: '❌ Anda belum membuat email. Ketik *!tempmail create* terlebih dahulu.' }, { quoted: msg });
        }
        
        const email = userMails[sender];
        const [login, domain] = email.split('@');
        
        // Mengecek kotak masuk
        const response = await fetch(`https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`);
        const data = await response.json();
        
        if (data.length === 0) {
          return await sock.sendMessage(from, { text: `📭 Kotak masuk masih kosong untuk email:\n*${email}*\n\n_Jika Anda sedang menunggu kode verifikasi/OTP, silakan tunggu beberapa saat lalu ketik perintah ini lagi._` }, { quoted: msg });
        }
        
        let inboxText = `📬 *KOTAK MASUK* (${data.length} pesan)\n━━━━━━━━━━━━━━━━\n`;
        data.forEach((mail, index) => {
          inboxText += `*${index + 1}. Dari:* ${mail.from}\n` +
                       `*Subjek:* ${mail.subject}\n` +
                       `*Waktu:* ${mail.date}\n` +
                       `*ID Email:* ${mail.id}\n` +
                       `👉 _Ketik *!tempmail read ${mail.id}* untuk membaca._\n\n`;
        });
        
        await sock.sendMessage(from, { text: inboxText.trim() }, { quoted: msg });
      
      } else if (action === 'read') {
        if (!userMails[sender]) {
          return await sock.sendMessage(from, { text: '❌ Anda belum membuat email. Ketik *!tempmail create* terlebih dahulu.' }, { quoted: msg });
        }
        
        const mailId = args[1];
        if (!mailId) {
          return await sock.sendMessage(from, { text: '❌ Tolong sertakan ID email yang ingin dibaca. Contoh: *!tempmail read 12345678*' }, { quoted: msg });
        }
        
        const email = userMails[sender];
        const [login, domain] = email.split('@');
        
        // Membaca isi pesan berdasarkan ID
        const response = await fetch(`https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domain}&id=${mailId}`);
        
        if (!response.ok) {
           return await sock.sendMessage(from, { text: `❌ Gagal mengambil pesan. ID ${mailId} mungkin salah atau sudah dihapus.` }, { quoted: msg });
        }
        
        const data = await response.json();
        
        // Memisahkan teks atau menghapus tag HTML jika terpaksa
        const bodyText = data.textBody || (data.htmlBody ? data.htmlBody.replace(/<[^>]*>?/gm, '') : 'Tidak ada isi pesan.');
        
        const readText = `📖 *ISI EMAIL*\n━━━━━━━━━━━━━━━━\n` +
                         `*Dari:* ${data.from}\n` +
                         `*Subjek:* ${data.subject}\n` +
                         `*Waktu:* ${data.date}\n` +
                         `━━━━━━━━━━━━━━━━\n\n` +
                         `${bodyText.trim()}`;
                         
        await sock.sendMessage(from, { text: readText }, { quoted: msg });
      } else {
         await sock.sendMessage(from, { text: '❌ Command tidak valid. Ketik *!tempmail* untuk panduan lengkap.' }, { quoted: msg });
      }

    } catch (err) {
      console.error('Error tempmail:', err);
      await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat menghubungi server penyedia email sementara (1secmail). Silakan coba lagi nanti.' }, { quoted: msg });
    }
  }
};

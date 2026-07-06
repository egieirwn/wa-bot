const userMails = {}; // Objek untuk menyimpan list email sementara per pengguna (menyimpan maksimal 5 email aktif)

module.exports = {
  name: 'tempmail',
  description: 'Membuat email sementara (Temp-Mail) untuk menerima OTP/Verifikasi (Mendukung custom nama)',
  execute: async (sock, msg, from, args) => {
    // Memastikan command HANYA bisa berjalan di Private Chat (Japri)
    const isGroup = from.endsWith('@g.us');
    if (isGroup) {
      return await sock.sendMessage(from, { text: '❌ *Akses Ditolak!*\n\nCommand ini bersifat privat dan berisi data sensitif. Silakan gunakan command ini di *Private Chat* (Japri) dengan bot.' }, { quoted: msg });
    }

    const action = args[0]?.toLowerCase();
    const sender = msg.key.remoteJid;

    // Inisialisasi array untuk user jika belum ada
    if (!userMails[sender]) {
      userMails[sender] = [];
    }

    if (!action || action === 'help') {
      let emailListText = '';
      if (userMails[sender].length > 0) {
        emailListText = `\n\n*📧 Daftar Email Aktif Anda (Maks 5):*\n` +
          userMails[sender].map((m, idx) => `*${idx + 1}.* \`${m.address}\` ${idx === userMails[sender].length - 1 ? '_(Terbaru)_' : ''}`).join('\n') +
          `\n\n💡 *Tips:* \n` +
          `• Cek inbox email terbaru: *!tempmail inbox*\n` +
          `• Cek inbox email tertentu: *!tempmail inbox <alamat_email>*\n` +
          `  _Contoh: !tempmail inbox ivan666@web-library.net_`;
      } else {
        emailListText = `\n\n_Email Anda saat ini:_ \n❌ Belum ada email aktif. Ketik *!tempmail create* untuk membuat baru.`;
      }

      const helpText = `📧 *TEMP-MAIL GENERATOR (Premium)* 📧\n\n` +
                       `Fitur untuk membuat alamat email sementara gratis untuk mendaftar akun agar terhindar dari spam.\n\n` +
                       `*Cara penggunaan:*\n` +
                       `• *!tempmail create* - Buat email acak\n` +
                       `• *!tempmail create namaAnda* - Buat email dengan nama custom (contoh: egie123)\n` +
                       `• *!tempmail inbox* - Cek inbox email terbaru\n` +
                       `• *!tempmail inbox <email>* - Cek inbox email tertentu\n` +
                       `• *!tempmail read <id>* - Baca isi email` + 
                       emailListText;

      return await sock.sendMessage(from, { text: helpText }, { quoted: msg });
    }

    try {
      if (action === 'create') {
        await sock.sendMessage(from, { text: '⏳ Sedang menyiapkan email sementara...' });
        
        // Ambil domain aktif dari Mail.tm
        const domainRes = await fetch('https://api.mail.tm/domains');
        const domainData = await domainRes.json();
        const domain = domainData['hydra:member'][0].domain;

        // Custom nama email atau acak
        let username = args[1];
        if (!username) {
            username = Math.random().toString(36).substring(2, 10);
        }
        
        // Bersihkan username dari karakter aneh
        username = username.toLowerCase().replace(/[^a-z0-9]/g, '');
        const address = `${username}@${domain}`;
        const password = 'WaBotPassword123!';

        // Daftarkan akun
        const createRes = await fetch('https://api.mail.tm/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, password })
        });
        
        if (!createRes.ok) {
            const errData = await createRes.json();
            if (errData.message && errData.message.includes('has already been taken')) {
                 return await sock.sendMessage(from, { text: `❌ Nama email *${username}* sudah dipakai orang lain. Silakan coba nama lain.` }, { quoted: msg });
            }
            throw new Error('Gagal membuat akun');
        }

        // Dapatkan token akses
        const tokenRes = await fetch('https://api.mail.tm/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, password })
        });
        const tokenData = await tokenRes.json();

        // Simpan ke daftar email aktif user
        userMails[sender].push({
            address: address,
            token: tokenData.token
        });
        
        // Batasi maksimal 5 email aktif untuk menghemat memori
        if (userMails[sender].length > 5) {
            userMails[sender].shift(); // Hapus email terlama
        }
        
        await sock.sendMessage(from, { text: `✅ *Email Berhasil Dibuat!*\n\n📧 Alamat Email: \`${address}\`\n\nSilakan copy dan gunakan email ini untuk mendaftar. Jika sudah selesai, ketik *!tempmail inbox* untuk mengecek pesan masuk.` }, { quoted: msg });
      
      } else if (action === 'inbox') {
        if (userMails[sender].length === 0) {
          return await sock.sendMessage(from, { text: '❌ Anda belum membuat email atau riwayat email Anda sudah kadaluarsa. Ketik *!tempmail create* terlebih dahulu.' }, { quoted: msg });
        }
        
        // Cek apakah user menentukan email spesifik
        const inputAddress = args[1]?.toLowerCase();
        let targetMail = null;

        if (inputAddress) {
          targetMail = userMails[sender].find(m => m.address.toLowerCase() === inputAddress);
          if (!targetMail) {
            return await sock.sendMessage(from, { 
              text: `❌ Alamat email *${args[1]}* tidak ditemukan dalam riwayat email aktif Anda.\nKetik *!tempmail* untuk melihat daftar email Anda.` 
            }, { quoted: msg });
          }
        } else {
          // Default ke email yang paling baru dibuat
          targetMail = userMails[sender][userMails[sender].length - 1];
        }

        const { address, token } = targetMail;
        
        // Mengecek kotak masuk
        const response = await fetch(`https://api.mail.tm/messages`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        const messages = data['hydra:member'];
        
        if (messages.length === 0) {
          return await sock.sendMessage(from, { text: `📭 Kotak masuk masih kosong untuk email:\n*${address}*\n\n_Jika Anda sedang menunggu kode verifikasi/OTP, silakan tunggu beberapa saat lalu ketik perintah ini lagi._` }, { quoted: msg });
        }
        
        let inboxText = `📬 *KOTAK MASUK* (${messages.length} pesan)\n📧 Email: *${address}*\n━━━━━━━━━━━━━━━━\n`;
        messages.forEach((mail, index) => {
          inboxText += `*${index + 1}. Dari:* ${mail.from.address}\n` +
                       `*Subjek:* ${mail.subject}\n` +
                       `*ID Email:* ${mail.id}\n` +
                       `👉 _Ketik *!tempmail read ${mail.id}* untuk membaca._\n\n`;
        });
        
        await sock.sendMessage(from, { text: inboxText.trim() }, { quoted: msg });
      
      } else if (action === 'read') {
        if (userMails[sender].length === 0) {
          return await sock.sendMessage(from, { text: '❌ Anda belum membuat email. Ketik *!tempmail create* terlebih dahulu.' }, { quoted: msg });
        }
        
        const mailId = args[1];
        if (!mailId) {
          return await sock.sendMessage(from, { text: '❌ Tolong sertakan ID email yang ingin dibaca. Contoh: *!tempmail read 12345678*' }, { quoted: msg });
        }
        
        // Cari token dari email-email aktif milik user yang memiliki pesan dengan ID tersebut
        let messageData = null;
        let successEmail = '';

        for (const mail of userMails[sender]) {
          try {
            const response = await fetch(`https://api.mail.tm/messages/${mailId}`, {
                headers: { 'Authorization': `Bearer ${mail.token}` }
            });
            if (response.ok) {
              messageData = await response.json();
              successEmail = mail.address;
              break; // Keluar dari loop jika berhasil mengambil pesan
            }
          } catch (e) {
            // Lanjut cari di email berikutnya
          }
        }
        
        if (!messageData) {
           return await sock.sendMessage(from, { text: `❌ Gagal mengambil pesan. ID ${mailId} tidak ditemukan di semua email aktif Anda.` }, { quoted: msg });
        }
        
        const bodyText = messageData.text || 'Tidak ada isi teks pada pesan ini.';
        
        const readText = `📖 *ISI EMAIL*\n━━━━━━━━━━━━━━━━\n` +
                          `*Penerima:* ${successEmail}\n` +
                          `*Dari:* ${messageData.from.address}\n` +
                          `*Subjek:* ${messageData.subject}\n` +
                          `*Waktu:* ${new Date(messageData.createdAt).toLocaleString('id-ID')}\n` +
                          `━━━━━━━━━━━━━━━━\n\n` +
                          `${bodyText.trim()}`;
                          
        await sock.sendMessage(from, { text: readText }, { quoted: msg });
      } else {
         await sock.sendMessage(from, { text: '❌ Command tidak valid. Ketik *!tempmail* untuk panduan lengkap.' }, { quoted: msg });
      }

    } catch (err) {
      console.error('Error tempmail:', err);
      await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat menghubungi server penyedia email. Silakan coba lagi nanti.' }, { quoted: msg });
    }
  }
};

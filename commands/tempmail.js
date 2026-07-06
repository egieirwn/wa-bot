const axios = require('axios');

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
          `  _Contoh: !tempmail inbox ivan666@guerrillamailblock.com_`;
      } else {
        emailListText = `\n\n_Email Anda saat ini:_ \n❌ Belum ada email aktif. Ketik *!tempmail create* untuk membuat baru.`;
      }

      const helpText = `📧 *TEMP-MAIL GENERATOR (Anti-Block Bypass)* 📧\n\n` +
                       `Fitur untuk membuat alamat email sementara gratis yang teroptimasi melewati blokir (Anti-Block) untuk mendaftar akun.\n\n` +
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
        
        let username = args[1];
        let url = '';

        if (username) {
          // Bersihkan username dari karakter aneh
          username = username.toLowerCase().replace(/[^a-z0-9]/g, '');
          url = `https://api.guerrillamail.com/ajax.php?f=set_email_user&email_user=${encodeURIComponent(username)}&site=guerrillamail.com&lang=en`;
        } else {
          url = 'https://api.guerrillamail.com/ajax.php?f=get_email_address&lang=en';
        }

        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });

        const data = response.data;
        if (!data || !data.email_addr || !data.sid_token) {
          throw new Error('Gagal berkomunikasi dengan server email.');
        }

        const address = data.email_addr;
        const token = data.sid_token;

        // Simpan ke daftar email aktif user
        userMails[sender].push({ address, token });
        
        // Batasi maksimal 5 email aktif
        if (userMails[sender].length > 5) {
            userMails[sender].shift();
        }
        
        await sock.sendMessage(from, { text: `✅ *Email Berhasil Dibuat!*\n\n📧 Alamat Email: \`${address}\`\n\nSilakan copy dan gunakan email ini untuk mendaftar. Jika sudah selesai, ketik *!tempmail inbox* untuk mengecek pesan masuk.` }, { quoted: msg });
      
      } else if (action === 'inbox') {
        if (userMails[sender].length === 0) {
          return await sock.sendMessage(from, { text: '❌ Anda belum membuat email. Ketik *!tempmail create* terlebih dahulu.' }, { quoted: msg });
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
        const url = `https://api.guerrillamail.com/ajax.php?f=check_email&seq=0&sid_token=${token}`;
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });

        const data = response.data;
        // Filter email selamat datang agar tidak mengganggu (Welcome to Guerrilla Mail)
        const messages = (data.list || []).filter(mail => mail.mail_from !== 'no-reply@guerrillamail.com');
        
        if (messages.length === 0) {
          return await sock.sendMessage(from, { text: `📭 Kotak masuk masih kosong untuk email:\n*${address}*\n\n_Jika Anda sedang menunggu kode verifikasi/OTP, silakan tunggu beberapa saat lalu ketik perintah ini lagi._` }, { quoted: msg });
        }
        
        let inboxText = `📬 *KOTAK MASUK* (${messages.length} pesan)\n📧 Email: *${address}*\n━━━━━━━━━━━━━━━━\n`;
        messages.forEach((mail, index) => {
          inboxText += `*${index + 1}. Dari:* ${mail.mail_from}\n` +
                       `*Subjek:* ${mail.mail_subject}\n` +
                       `*ID Email:* ${mail.mail_id}\n` +
                       `👉 _Ketik *!tempmail read ${mail.mail_id}* untuk membaca._\n\n`;
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
            const url = `https://api.guerrillamail.com/ajax.php?f=fetch_email&email_id=${mailId}&sid_token=${mail.token}`;
            const response = await axios.get(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            });
            // Jika berhasil mengambil email dan data bukan null/error
            if (response.data && response.data.mail_body) {
              messageData = response.data;
              successEmail = mail.address;
              break;
            }
          } catch (e) {
            // Coba email berikutnya
          }
        }
        
        if (!messageData) {
           return await sock.sendMessage(from, { text: `❌ Gagal mengambil pesan. ID ${mailId} tidak ditemukan atau sudah kadaluarsa.` }, { quoted: msg });
        }
        
        // Bersihkan HTML body jika berisi tag HTML
        let bodyText = messageData.mail_body || 'Tidak ada isi teks pada pesan ini.';
        bodyText = bodyText
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<p[^>]*>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<[^>]+>/g, '') // Hapus tag HTML lainnya
          .trim();
        
        const readText = `📖 *ISI EMAIL*\n━━━━━━━━━━━━━━━━\n` +
                          `*Penerima:* ${successEmail}\n` +
                          `*Dari:* ${messageData.mail_from}\n` +
                          `*Subjek:* ${messageData.mail_subject}\n` +
                          `*Waktu:* ${messageData.mail_date || 'Baru saja'}\n` +
                          `━━━━━━━━━━━━━━━━\n\n` +
                          `${bodyText}`;
                          
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

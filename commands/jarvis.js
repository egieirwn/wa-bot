const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Muat API key dari config.json
let GEMINI_API_KEY = '';
try {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
  GEMINI_API_KEY = config.geminiApiKey || '';
} catch (e) {
  console.error('⚠️ config.json tidak ditemukan! Fitur Jarvis tidak akan berfungsi.');
}

module.exports = {
  name: 'jarvis',
  description: 'Asisten AI cerdas. Ketik "jarvis [perintah]" tanpa tanda seru.',
  async execute(sock, msg, from, args, allCommands) {
    if (!GEMINI_API_KEY) {
      return await sock.sendMessage(from, { text: '❌ API key belum dikonfigurasi. Hubungi admin bot.' }, { quoted: msg });
    }

    if (!args.length) {
      return await sock.sendMessage(from, {
        text: '🤖 *Halo! Saya Jarvis, asisten AI Anda.*\n\n'
            + 'Contoh penggunaan:\n'
            + '◦ _jarvis buatkan stiker dari foto ini_\n'
            + '◦ _jarvis download video tiktok [link]_\n'
            + '◦ _jarvis hapus pesan ini_\n'
            + '◦ _jarvis apa itu AI?_\n'
            + '\nCukup ketik *jarvis* diikuti perintah Anda!'
      }, { quoted: msg });
    }

    const userRequest = args.join(' ');

    // Kumpulkan daftar command yang tersedia beserta deskripsinya
    const commandList = allCommands
      ? Object.values(allCommands)
          .filter(cmd => cmd.name !== 'jarvis')
          .map(cmd => `!${cmd.name}: ${cmd.description || 'Tidak ada deskripsi'}`)
          .join('\n')
      : '(tidak tersedia)';

    // Analisis konteks pesan (apakah ada media, reply, dsb.)
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const hasQuotedImage = !!quotedMsg?.imageMessage;
    const hasQuotedVideo = !!quotedMsg?.videoMessage;
    const hasQuotedSticker = !!quotedMsg?.stickerMessage;
    const hasDirectImage = !!msg.message?.imageMessage;
    const hasDirectVideo = !!msg.message?.videoMessage;
    const hasReply = !!quotedMsg;

    const contextParts = [];
    if (hasDirectImage) contextParts.push('User mengirim foto bersama pesan ini');
    if (hasDirectVideo) contextParts.push('User mengirim video bersama pesan ini');
    if (hasQuotedImage) contextParts.push('User me-reply/membalas sebuah foto');
    if (hasQuotedVideo) contextParts.push('User me-reply/membalas sebuah video');
    if (hasQuotedSticker) contextParts.push('User me-reply/membalas sebuah stiker');
    if (hasReply && !hasQuotedImage && !hasQuotedVideo && !hasQuotedSticker) {
      contextParts.push('User me-reply/membalas sebuah pesan teks');
    }

    const contextString = contextParts.length > 0
      ? contextParts.join('. ')
      : 'Pesan teks biasa tanpa media atau reply';

    // Prompt sistem untuk Gemini
    const systemPrompt = `Kamu adalah Jarvis, asisten AI cerdas di WhatsApp bot bernama "Antigravity Bot".
Tugasmu adalah menganalisis permintaan user dan menentukan aksi yang paling tepat.

== DAFTAR COMMAND YANG TERSEDIA ==
${commandList}

== AKSI KHUSUS WHATSAPP ==
- DELETE_FOR_ALL: Menghapus pesan yang di-reply untuk semua orang (hanya bisa jika user me-reply pesan)
- CHAT: Menjawab pertanyaan umum, ngobrol, atau memberikan informasi

== KONTEKS PESAN SAAT INI ==
${contextString}

== INSTRUKSI ==
Analisis permintaan user dan jawab HANYA dalam format JSON berikut:

Jika user ingin menjalankan command bot:
{"action":"COMMAND","command":"nama_command","args":["arg1","arg2"],"reply":"Pesan balasan singkat"}

Jika user ingin menghapus pesan untuk semua orang:
{"action":"DELETE_FOR_ALL","reply":"Pesan balasan singkat"}

Jika user ingin ngobrol atau bertanya:
{"action":"CHAT","reply":"Jawaban kamu yang informatif dan ramah"}

== ATURAN ==
- Untuk action COMMAND: isi "command" dengan nama command TANPA tanda seru, "args" dengan parameter yang dibutuhkan
- Contoh: user bilang "download video tiktok https://..." → {"action":"COMMAND","command":"tiktok","args":["https://..."],"reply":"Baik, saya download videonya!"}
- Contoh: user bilang "jadikan stiker" (sambil kirim foto) → {"action":"COMMAND","command":"sticker","args":[],"reply":"Siap, saya buatkan stikernya!"}
- Contoh: user bilang "keluarkan dia" atau "kick orang ini" (sambil me-reply pesan) → {"action":"COMMAND","command":"kick","args":[],"reply":"Orang tersebut telah saya keluarkan."}
- Contoh: user bilang "ubah nama grup jadi Mabar Seru" → {"action":"COMMAND","command":"groupname","args":["Mabar","Seru"],"reply":"Nama grup telah saya ubah."}
- Contoh: user bilang "jadikan foto grup" (sambil me-reply foto) → {"action":"COMMAND","command":"toprofile","args":[],"reply":"Foto grup berhasil diubah."}
- Contoh: user bilang "hapus pesan ini untuk semua" → {"action":"DELETE_FOR_ALL","reply":"Pesan berhasil dihapus untuk semua orang."}
- Untuk CHAT: berikan jawaban yang informatif, ramah, dan dalam Bahasa Indonesia
- SELALU jawab dalam Bahasa Indonesia
- HANYA output JSON, tidak ada teks lain di luar JSON`;

    // === DETEKSI LANGSUNG: Command grup (tanpa perlu AI) ===
    const reqLower = userRequest.toLowerCase();

    // Deteksi kick/keluarkan
    const kickKeywords = ['kick', 'keluarkan', 'keluarin', 'tendang', 'usir', 'remove'];
    const isKickRequest = kickKeywords.some(kw => reqLower.includes(kw));
    if (isKickRequest && allCommands?.['kick']) {
      await sock.sendMessage(from, { react: { text: '🤖', key: msg.key } });
      await sock.sendMessage(from, { text: '🤖 Baik, saya akan mengeluarkan anggota tersebut.' }, { quoted: msg });
      return await allCommands['kick'].execute(sock, msg, from, args, allCommands);
    }

    // Deteksi groupname/ganti nama grup
    const gnKeywords = ['ganti nama grup', 'ubah nama grup', 'rename grup', 'nama grup'];
    const isGnRequest = gnKeywords.some(kw => reqLower.includes(kw));
    if (isGnRequest && allCommands?.['groupname']) {
      // Ambil nama baru dari teks setelah keyword
      let newName = userRequest;
      for (const kw of gnKeywords) {
        const idx = reqLower.indexOf(kw);
        if (idx !== -1) {
          newName = userRequest.slice(idx + kw.length).replace(/^[\s:]+|jadi\s+/gi, '').trim();
          break;
        }
      }
      if (!newName) {
        return await sock.sendMessage(from, { text: '🤖 Silakan sebutkan nama baru untuk grup.\nContoh: *jarvis ganti nama grup jadi Mabar Seru*' }, { quoted: msg });
      }
      await sock.sendMessage(from, { react: { text: '🤖', key: msg.key } });
      await sock.sendMessage(from, { text: `🤖 Baik, saya ubah nama grup menjadi *${newName}*` }, { quoted: msg });
      const gnArgs = newName.split(/\s+/);
      return await allCommands['groupname'].execute(sock, msg, from, gnArgs, allCommands);
    }

    // Deteksi toprofile/ganti foto grup
    const ppKeywords = ['foto grup', 'foto profil grup', 'profile grup', 'pp grup', 'ganti foto grup', 'jadikan foto grup'];
    const isPpRequest = ppKeywords.some(kw => reqLower.includes(kw));
    if (isPpRequest && allCommands?.['toprofile']) {
      await sock.sendMessage(from, { react: { text: '🤖', key: msg.key } });
      await sock.sendMessage(from, { text: '🤖 Baik, saya akan mengubah foto profil grup.' }, { quoted: msg });
      return await allCommands['toprofile'].execute(sock, msg, from, args, allCommands);
    }

    // Deteksi qr/qrcode
    const qrKeywords = ['buat qr', 'bikin qr', 'buat qrcode', 'bikin qrcode', 'generate qr'];
    const isQrRequest = qrKeywords.some(kw => reqLower.includes(kw)) || reqLower.startsWith('qr ');
    if (isQrRequest && allCommands?.['qr']) {
      // Ambil teks setelah kata kunci
      let qrText = userRequest;
      for (const kw of qrKeywords) {
        const idx = reqLower.indexOf(kw);
        if (idx !== -1) {
          qrText = userRequest.slice(idx + kw.length).replace(/^[\s:]+|jadi\s+/gi, '').trim();
          break;
        }
      }
      if (reqLower.startsWith('qr ')) {
        qrText = userRequest.slice(3).trim();
      }
      
      const qrArgs = qrText ? qrText.split(/\s+/) : [];
      return await allCommands['qr'].execute(sock, msg, from, qrArgs, allCommands);
    }

    // Deteksi ocr/salin teks/baca foto
    const ocrKeywords = ['ocr', 'salin teks', 'baca teks', 'bacakan teks', 'baca foto', 'bacakan foto', 'tulisan di foto', 'tulisan di gambar'];
    const isOcrRequest = ocrKeywords.some(kw => reqLower.includes(kw));
    if (isOcrRequest && allCommands?.['ocr']) {
      return await allCommands['ocr'].execute(sock, msg, from, args, allCommands);
    }

    // Deteksi getsticker/cari stiker otomatis
    const sSearchKeywords = ['cari stiker', 'bikin stiker', 'buat stiker', 'getsticker', 'ssearch'];
    const isSsearchRequest = sSearchKeywords.some(kw => reqLower.includes(kw));
    // Hanya picu getsticker jika tidak ada gambar yang dikirim/di-reply
    if (isSsearchRequest && !hasDirectImage && !hasQuotedImage && allCommands?.['getsticker']) {
      let stickerQuery = userRequest;
      for (const kw of sSearchKeywords) {
        const idx = reqLower.indexOf(kw);
        if (idx !== -1) {
          stickerQuery = userRequest.slice(idx + kw.length).replace(/^[\s:]+|jadi\s+/gi, '').trim();
          break;
        }
      }
      if (!stickerQuery) {
        return await sock.sendMessage(from, { text: '🤖 Silakan sebutkan stiker apa yang ingin dicari.\nContoh: *jarvis cari stiker patrick*' }, { quoted: msg });
      }
      const sArgs = stickerQuery.split(/\s+/);
      return await allCommands['getsticker'].execute(sock, msg, from, sArgs, allCommands);
    }

    // Deteksi draw/buat gambar AI
    const drawKeywords = ['gambarkan', 'buat gambar', 'buatkan gambar', 'lukis', 'lukiskan', 'generate gambar', 'draw'];
    const isDrawRequest = drawKeywords.some(kw => reqLower.includes(kw)) || reqLower.startsWith('draw ');
    if (isDrawRequest && allCommands?.['draw']) {
      let drawQuery = userRequest;
      for (const kw of drawKeywords) {
        const idx = reqLower.indexOf(kw);
        if (idx !== -1) {
          drawQuery = userRequest.slice(idx + kw.length).replace(/^[\s:]+|jadi\s+/gi, '').trim();
          break;
        }
      }
      if (reqLower.startsWith('draw ')) {
        drawQuery = userRequest.slice(5).trim();
      }
      if (!drawQuery) {
        return await sock.sendMessage(from, { text: '🤖 Silakan sebutkan gambar apa yang ingin dibuat.\nContoh: *jarvis gambarkan astronot di bulan*' }, { quoted: msg });
      }
      const dArgs = drawQuery.split(/\s+/);
      return await allCommands['draw'].execute(sock, msg, from, dArgs, allCommands);
    }

    // Deteksi stalkig (Instagram)
    const stalkigKeywords = ['stalk instagram', 'kepoin instagram', 'info instagram', 'stalkig'];
    const isStalkigRequest = stalkigKeywords.some(kw => reqLower.includes(kw)) || reqLower.startsWith('stalkig ');
    if (isStalkigRequest && allCommands?.['stalkig']) {
      let username = userRequest;
      for (const kw of stalkigKeywords) {
        const idx = reqLower.indexOf(kw);
        if (idx !== -1) {
          username = userRequest.slice(idx + kw.length).replace(/^[\s:]+|username\s+/gi, '').trim();
          break;
        }
      }
      if (reqLower.startsWith('stalkig ')) {
        username = userRequest.slice(8).trim();
      }
      if (!username) {
        return await sock.sendMessage(from, { text: '🤖 Silakan sebutkan username Instagram yang ingin distalk.\nContoh: *jarvis stalk instagram sandhikagalih*' }, { quoted: msg });
      }
      return await allCommands['stalkig'].execute(sock, msg, from, [username], allCommands);
    }

    // Deteksi stalktt (TikTok)
    const stalkttKeywords = ['stalk tiktok', 'kepoin tiktok', 'info tiktok', 'stalktt'];
    const isStalkttRequest = stalkttKeywords.some(kw => reqLower.includes(kw)) || reqLower.startsWith('stalktt ');
    if (isStalkttRequest && allCommands?.['stalktt']) {
      let username = userRequest;
      for (const kw of stalkttKeywords) {
        const idx = reqLower.indexOf(kw);
        if (idx !== -1) {
          username = userRequest.slice(idx + kw.length).replace(/^[\s:]+|username\s+/gi, '').trim();
          break;
        }
      }
      if (reqLower.startsWith('stalktt ')) {
        username = userRequest.slice(8).trim();
      }
      if (!username) {
        return await sock.sendMessage(from, { text: '🤖 Silakan sebutkan username TikTok yang ingin distalk.\nContoh: *jarvis stalk tiktok khaby.lame*' }, { quoted: msg });
      }
      return await allCommands['stalktt'].execute(sock, msg, from, [username], allCommands);
    }

    // Deteksi stalkgh (GitHub)
    const stalkghKeywords = ['stalk github', 'kepoin github', 'info github', 'stalkgh'];
    const isStalkghRequest = stalkghKeywords.some(kw => reqLower.includes(kw)) || reqLower.startsWith('stalkgh ');
    if (isStalkghRequest && allCommands?.['stalkgh']) {
      let username = userRequest;
      for (const kw of stalkghKeywords) {
        const idx = reqLower.indexOf(kw);
        if (idx !== -1) {
          username = userRequest.slice(idx + kw.length).replace(/^[\s:]+|username\s+/gi, '').trim();
          break;
        }
      }
      if (reqLower.startsWith('stalkgh ')) {
        username = userRequest.slice(8).trim();
      }
      if (!username) {
        return await sock.sendMessage(from, { text: '🤖 Silakan sebutkan username GitHub yang ingin distalk.\nContoh: *jarvis stalk github torvalds*' }, { quoted: msg });
      }
      return await allCommands['stalkgh'].execute(sock, msg, from, [username], allCommands);
    }

    try {
      // Beri reaksi "berpikir" pada pesan user
      await sock.sendMessage(from, { react: { text: '🤔', key: msg.key } });
      // Ambil detail gambar jika ada untuk multimodal
      let imageBuffer = null;
      if (hasDirectImage || hasQuotedImage) {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        let fakeMsg = msg;
        if (hasQuotedImage) {
          const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
          fakeMsg = {
            key: {
              remoteJid: from,
              fromMe: msg.key.fromMe,
              id: contextInfo?.stanzaId,
              participant: contextInfo?.participant
            },
            message: quotedMsg
          };
        }
        
        try {
          imageBuffer = await downloadMediaMessage(
            fakeMsg,
            'buffer',
            {},
            { reuploadRequest: sock.updateMediaMessage }
          );
        } catch (err) {
          console.error('Error downloading image for Jarvis:', err);
        }
      }

      // Daftar model Gemini
      const MODELS = [
        'gemini-flash-lite-latest',
        'gemini-2.0-flash-lite',
        'gemini-flash-latest',
      ];

      const requestBody = {
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\nPermintaan user: "${userRequest}"` }]
          }
        ],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 1024,
        }
      };

      if (imageBuffer) {
        requestBody.contents[0].parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageBuffer.toString('base64')
          }
        });
      }

      // Coba setiap model secara berurutan, dengan retry untuk rate limit
      async function callGemini() {
        let lastError;
        for (const model of MODELS) {
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              const res = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
                requestBody,
                { headers: { 'Content-Type': 'application/json' }, timeout: 20000 }
              );
              return res;
            } catch (err) {
              lastError = err;
              if (err.response?.status === 429 && attempt < 2) {
                await new Promise(r => setTimeout(r, 3000));
                continue;
              }
              break; // Coba model berikutnya
            }
          }
        }
        throw lastError;
      }

      // Kirim ke Gemini API (dengan fallback multi-model)
      const response = await callGemini();

      const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // Parse JSON dari response Gemini
      const jsonMatch = aiText.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) {
        // Jika Gemini tidak mengembalikan JSON, tampilkan jawaban mentahnya
        await sock.sendMessage(from, { react: { text: '🤖', key: msg.key } });
        return await sock.sendMessage(from, { text: `🤖 ${aiText}` }, { quoted: msg });
      }

      let result;
      try {
        result = JSON.parse(jsonMatch[0]);
      } catch {
        await sock.sendMessage(from, { react: { text: '🤖', key: msg.key } });
        return await sock.sendMessage(from, { text: `🤖 ${aiText}` }, { quoted: msg });
      }

      // Ganti reaksi menjadi "selesai"
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

      // Eksekusi berdasarkan aksi
      if (result.action === 'COMMAND') {
        const targetCmd = allCommands?.[result.command];
        if (targetCmd) {
          // Kirim balasan Jarvis
          if (result.reply) {
            await sock.sendMessage(from, { text: `🤖 ${result.reply}` }, { quoted: msg });
          }
          // Jalankan command yang diminta
          await targetCmd.execute(sock, msg, from, result.args || [], allCommands);
        } else {
          await sock.sendMessage(from, {
            text: `🤖 Maaf, command *!${result.command}* tidak ditemukan.\n${result.reply || ''}`
          }, { quoted: msg });
        }

      } else if (result.action === 'DELETE_FOR_ALL') {
        if (!hasReply) {
          return await sock.sendMessage(from, {
            text: '🤖 Untuk menghapus pesan, Anda harus me-reply (membalas) pesan yang ingin dihapus terlebih dahulu.'
          }, { quoted: msg });
        }

        try {
          const stanzaId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
          const participant = msg.message?.extendedTextMessage?.contextInfo?.participant;

          if (stanzaId) {
            await sock.sendMessage(from, {
              delete: {
                remoteJid: from,
                fromMe: false,
                id: stanzaId,
                participant: participant || undefined
              }
            });
            await sock.sendMessage(from, { text: `🤖 ${result.reply || 'Pesan telah dihapus.'}` }, { quoted: msg });
          } else {
            await sock.sendMessage(from, { text: '🤖 Gagal menghapus. Tidak bisa menemukan ID pesan.' }, { quoted: msg });
          }
        } catch (delErr) {
          await sock.sendMessage(from, {
            text: '🤖 Gagal menghapus pesan. Pastikan bot adalah admin grup, atau pesan tersebut adalah milik bot.'
          }, { quoted: msg });
        }

      } else {
        // CHAT - jawab percakapan biasa
        await sock.sendMessage(from, { text: `🤖 ${result.reply || 'Maaf, saya tidak mengerti.'}` }, { quoted: msg });
      }

    } catch (err) {
      console.error('Jarvis error:', err.message, err.response?.data || '');
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });

      // Tampilkan detail error untuk debugging
      const errDetail = err.response?.data?.error?.message || err.message || 'Unknown error';
      const errStatus = err.response?.status || '';
      await sock.sendMessage(from, { text: `❌ Jarvis error${errStatus ? ` (${errStatus})` : ''}:\n_${errDetail}_` }, { quoted: msg });
    }
  }
};

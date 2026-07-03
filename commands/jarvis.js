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

    try {
      // Beri reaksi "berpikir" pada pesan user
      await sock.sendMessage(from, { react: { text: '🤔', key: msg.key } });

      // Daftar model Gemini (versi 1.5 ternyata sudah tidak tersedia di akun Anda, 
      // jadi kita gunakan model terbaru yang didukung oleh API key Anda)
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

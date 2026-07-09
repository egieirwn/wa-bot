const axios = require('axios');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'toanime',
  description: 'Mengubah foto wajah Anda menjadi gambar anime estetik menggunakan AI AnimeGAN v2. Caranya: Kirim foto atau reply foto dengan teks *!toanime*',
  async execute(sock, msg, from, args) {
    // 1. Deteksi apakah ada foto langsung atau foto yang di-reply
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const hasDirectImage = !!msg.message?.imageMessage;
    const hasQuotedImage = !!quotedMsg?.imageMessage;

    if (!hasDirectImage && !hasQuotedImage) {
      return await sock.sendMessage(
        from, 
        { text: '❌ *Perintah Gagal!*\nSilakan kirim foto atau balas (reply) foto yang sudah ada dengan mengetik *!toanime*.' }, 
        { quoted: msg }
      );
    }

    try {
      // Reaksi sedang memproses
      await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

      // 2. Tentukan pesan sumber media (direct vs quoted)
      let mediaMsg = msg;
      let mimeType = msg.message?.imageMessage?.mimetype || 'image/png';
      
      if (hasQuotedImage) {
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        mediaMsg = {
          key: {
            remoteJid: from,
            fromMe: msg.key.fromMe,
            id: contextInfo?.stanzaId,
            participant: contextInfo?.participant
          },
          message: quotedMsg
        };
        mimeType = quotedMsg.imageMessage.mimetype || 'image/png';
      }

      // 3. Unduh gambar sebagai buffer
      const buffer = await downloadMediaMessage(
        mediaMsg,
        'buffer',
        {},
        { reuploadRequest: sock.updateMediaMessage }
      );

      if (!buffer) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
        return await sock.sendMessage(from, { text: '❌ Gagal mengunduh gambar dari server WhatsApp.' }, { quoted: msg });
      }

      // Konversi buffer ke base64
      const base64Image = `data:${mimeType};base64,${buffer.toString('base64')}`;

      // 4. Kirim request ke Hugging Face AnimeGAN v2 Space API (Queue / Call Endpoint)
      const callUrl = 'https://akhaliq-animeganv2.hf.space/gradio_api/call/inference';
      
      const callResponse = await axios.post(callUrl, {
        data: [
          {
            meta: { _type: 'gradio.FileData' },
            path: '',
            url: '',
            orig_name: 'input.png',
            size: buffer.length,
            mime_type: mimeType,
            data: base64Image
          },
          'version 2 (   robustness,   stylization)' // Versi AnimeGAN v2 terbaik
        ]
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000
      });

      const eventId = callResponse.data.event_id;
      if (!eventId) {
        throw new Error('Gagal mendapatkan Event ID dari server AI.');
      }

      // 5. Stream status antrean & hasil proses dari Gradio Space
      const statusUrl = `https://akhaliq-animeganv2.hf.space/gradio_api/call/inference/status/${eventId}`;
      const streamResponse = await axios.get(statusUrl, { responseType: 'stream', timeout: 45000 });

      let resolved = false;
      let animeImageUrl = '';

      await new Promise((resolve, reject) => {
        streamResponse.data.on('data', chunk => {
          const text = chunk.toString();
          
          if (text.includes('event: process_completed')) {
            const lines = text.split('\n');
            const dataLine = lines.find(l => l.startsWith('data: '));
            if (dataLine) {
              try {
                const jsonData = JSON.parse(dataLine.replace('data: ', '').trim());
                if (jsonData && jsonData[0]) {
                  const rawUrl = jsonData[0].url || jsonData[0].data;
                  if (rawUrl) {
                    // Perbaikan vital: Ganti /gradio_api/file= menjadi /file= untuk menghindari error 404 saat diunduh
                    animeImageUrl = rawUrl.replace('/gradio_api/file=', '/file=');
                    resolved = true;
                    resolve();
                  }
                }
              } catch (e) {
                console.error('Gagal parsing data output anime:', e);
              }
            }
          } else if (text.includes('event: error')) {
            resolved = true;
            reject(new Error('Server AI mengembalikan error saat memproses wajah.'));
          }
        });

        streamResponse.data.on('end', () => {
          if (!resolved) {
            reject(new Error('Koneksi terputus sebelum gambar selesai diproses.'));
          }
        });

        streamResponse.data.on('error', (err) => {
          reject(err);
        });
      });

      if (!animeImageUrl) {
        throw new Error('Hasil gambar anime kosong.');
      }

      // 6. Kirim hasil gambar anime ke WhatsApp
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
      await sock.sendMessage(
        from,
        { 
          image: { url: animeImageUrl }, 
          caption: '✨ *Hasil Konversi AnimeGAN v2!* ✨\n\nFoto Anda telah berhasil diubah menjadi versi anime estetik oleh Jarvis.' 
        },
        { quoted: msg }
      );

    } catch (err) {
      console.error('Error toanime:', err);
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      await sock.sendMessage(
        from, 
        { text: `❌ *Gagal memproses gambar!*\n_${err.message}_` }, 
        { quoted: msg }
      );
    }
  }
};

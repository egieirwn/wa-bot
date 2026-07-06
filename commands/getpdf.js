const axios = require('axios');

module.exports = {
  name: 'getpdf',
  description: 'Mengunduh PDF artikel ilmiah/jurnal akademik secara gratis dari DOI atau Link. Contoh: !getpdf 10.1038/nature12373',
  async execute(sock, msg, from, args) {
    const input = args.join(' ');
    if (!input) {
      return await sock.sendMessage(from, { 
        text: '❌ *Format Salah!*\n\nMasukkan DOI atau Link artikel ilmiah yang ingin diunduh.\nContoh:\n• *!getpdf 10.1038/nature12373*\n• *!getpdf https://doi.org/10.1016/j.cell.2016.06.017*' 
      }, { quoted: msg });
    }

    // Regex untuk mengekstrak DOI
    const doiRegex = /(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i;
    const match = input.match(doiRegex);
    
    if (!match) {
      return await sock.sendMessage(from, { 
        text: '❌ *DOI Tidak Valid!*\n\nFormat DOI tidak ditemukan di dalam input Anda. DOI biasanya dimulai dengan angka `10.` diikuti oleh beberapa digit dan slash (/).' 
      }, { quoted: msg });
    }

    const doi = match[1];
    const processMsg = await sock.sendMessage(from, { text: `⏳ *Sedang mencari PDF untuk DOI:* \`${doi}\`...\n\n_Mencoba mencari salinan dokumen di repositori publik..._` }, { quoted: msg });
    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

    try {
      let pdfUrl = null;
      let title = '';
      let source = '';

      // TAHAP 1: Coba cari lewat Unpaywall API (Data Open Access global)
      try {
        const unpaywallUrl = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=unpaywall@impactstory.org`;
        const res = await axios.get(unpaywallUrl, { timeout: 8000 });
        if (res.data && res.data.is_oa && res.data.best_oa_location?.url_for_pdf) {
          pdfUrl = res.data.best_oa_location.url_for_pdf;
          title = res.data.title || 'Dokumen Ilmiah';
          source = 'Unpaywall (Open Access)';
        }
      } catch (e) {
        console.warn('Gagal memproses Unpaywall:', e.message);
      }

      // TAHAP 2: Jika gagal, coba cari lewat Europe PMC API
      if (!pdfUrl) {
        try {
          const pmcUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:${encodeURIComponent(doi)}&format=json`;
          const res = await axios.get(pmcUrl, { timeout: 8000 });
          const paper = res.data.resultList?.result?.[0];
          if (paper && paper.isOpenAccess === 'Y' && paper.pmcid) {
            pdfUrl = `https://www.ncbi.nlm.nih.gov/pmc/articles/${paper.pmcid}/pdf/`;
            title = paper.title || 'Dokumen Ilmiah';
            source = 'Europe PMC (NCBI)';
          }
        } catch (e) {
          console.warn('Gagal memproses Europe PMC:', e.message);
        }
      }

      // Jika link PDF ditemukan, unduh dan kirimkan ke user
      if (pdfUrl) {
        // Edit loading message
        await sock.sendMessage(from, { 
          text: `📥 *Dokumen Ditemukan!*\n\n📖 *Judul:* ${title}\n🌐 *Sumber:* ${source}\n\n_Sedang mengunduh file PDF..._`,
          edit: processMsg.key
        });

        // Unduh file PDF
        const pdfResponse = await axios.get(pdfUrl, {
          responseType: 'arraybuffer',
          timeout: 25000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });

        const pdfBuffer = Buffer.from(pdfResponse.data, 'binary');
        const fileName = `${doi.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

        // Kirim file ke WhatsApp
        await sock.sendMessage(from, {
          document: pdfBuffer,
          mimetype: 'application/pdf',
          fileName: fileName,
          caption: `📄 *PDF DOWNLOADER BYPASS*\n━━━━━━━━━━━━━━━━━━\n\n📖 *Judul:* ${title}\n🔑 *DOI:* ${doi}\n🌐 *Sumber:* ${source}\n🔗 *Link Asli:* https://doi.org/${doi}`
        }, { quoted: msg });

        // Update status loading menjadi sukses
        try {
          await sock.sendMessage(from, { 
            text: `✅ *PDF Berhasil Dikirim!*\nSilakan cek dokumen di bawah ini.`,
            edit: processMsg.key
          });
        } catch (e) {}

        return await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
      }

      // TAHAP 3: Jika semua pencarian gagal (dokumen closed-access berbayar)
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      return await sock.sendMessage(from, {
        text: `❌ *Gagal Mengambil PDF!*\n\nArtikel ilmiah dengan DOI \`${doi}\` merupakan dokumen berbayar (*closed-access*) dan tidak tersedia secara gratis/terbuka (Open Access).\n\n_Catatan: Pengunduh ilegal (seperti Sci-Hub) saat ini tidak dapat digunakan langsung oleh server karena proteksi keamanan robot (Captcha) di jaringan hosting._`,
        edit: processMsg.key
      });

    } catch (err) {
      console.error('Error getpdf:', err);
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
      try {
        await sock.sendMessage(from, { 
          text: `❌ *Terjadi Error!*\n\nGagal memproses berkas PDF.\nDetail error: _${err.message}_`,
          edit: processMsg.key
        });
      } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Terjadi Error!*\n\nGagal memproses berkas PDF.\nDetail error: _${err.message}_` }, { quoted: msg });
      }
    }
  }
};

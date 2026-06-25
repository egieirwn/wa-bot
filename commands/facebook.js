const axios = require('axios')
const https = require('https')
const http = require('http')

const MAX_DURATION_SECONDS = 1800 // 30 menit

module.exports = {
  name: 'fbdl',
  description: 'Download video Facebook. Contoh: !fbdl https://www.facebook.com/video/xxx',
  async execute(sock, msg, from, args) {
    const url = args[0] || ''

    if (!url) {
      return await sock.sendMessage(from, { text: '❌ Masukkan URL Facebook.\nContoh: *!fbdl https://www.facebook.com/video/xxx*' })
    }

    const fbRegex = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.com)\/.+/i
    if (!fbRegex.test(url)) {
      return await sock.sendMessage(from, { text: '❌ URL Facebook tidak valid.' })
    }

    await sock.sendMessage(from, { text: '⏳ Mengunduh video Facebook...' })

    try {
      let mediaUrl = null
      let duration = null

      // Coba scrap langsung dari Facebook
      try {
        const { data } = await axios.get(url, {
          timeout: 20000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        })

        // Pattern 1: video MP4 dari facebook CDN
        let match = data.match(/https:\/\/[^\s"<>]*\.fbcdn\.net\/[^\s"<>]+\.mp4/)
        if (match) {
          mediaUrl = match[0]
        }

        // Pattern 2: dari og:video
        if (!mediaUrl) {
          match = data.match(/og:video["\s]*content=["']([^"']+\.mp4[^"']*)["']/)
          if (match) {
            mediaUrl = match[1]
          }
        }

        // Pattern 3: dari property og:video:url
        if (!mediaUrl) {
          match = data.match(/property="og:video:url"\s*content=["']([^"']+)["']/)
          if (match) {
            mediaUrl = match[1]
          }
        }

        // Coba extract durasi dari meta
        const durationMatch = data.match(/duration["\s]*:?\s*["']?(\d+)["']?/)
        if (durationMatch) {
          duration = parseInt(durationMatch[1])
        }
      } catch (e) {
        console.log('Direct scrape failed:', e.message)
      }

      // Fallback ke API jika direct scrape gagal
      if (!mediaUrl) {
        try {
          const response = await axios.get('https://api.nekolabs.web.id/downloader/facebook', {
            params: { url },
            timeout: 30000
          })

          const result = response.data?.result
          if (result) {
            mediaUrl = result?.hd || result?.sd || result?.links?.hd || result?.links?.sd || 
                       (Array.isArray(result) ? (result.find(r => r.quality === 'hd')?.url || result[0]?.url) : null)
            
            if (result?.duration) {
              duration = result.duration
            }
          }
        } catch (e) {
          console.log('API fallback failed:', e.message)
        }
      }

      if (!mediaUrl) {
        return await sock.sendMessage(from, { text: '❌ Video tidak ditemukan atau tidak bisa didownload.' })
      }

      // Check durasi jika tersedia
      if (duration && duration > MAX_DURATION_SECONDS) {
        const minutes = Math.floor(duration / 60)
        return await sock.sendMessage(from, { 
          text: `❌ Video terlalu panjang (${minutes} menit). Max durasi: 30 menit.` 
        })
      }

      // Download buffer dengan retry
      let buffer = null
      let retries = 3

      while (!buffer && retries > 0) {
        try {
          buffer = await downloadBuffer(mediaUrl)
          break
        } catch (e) {
          retries--
          if (retries === 0) throw e
          console.log(`Download retry... (${retries} attempts left)`)
          await new Promise(r => setTimeout(r, 1000))
        }
      }

      if (!buffer) {
        return await sock.sendMessage(from, { text: '❌ Gagal download video. Coba lagi nanti.' })
      }

      const durationText = duration ? `⏱️ ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : ''

      await sock.sendMessage(from, {
        video: buffer,
        caption: `🎬 *Facebook Video*\n${durationText}`,
        mimetype: 'video/mp4'
      })

    } catch (err) {
      console.error('Error facebook:', err.message)
      await sock.sendMessage(from, { text: '❌ Gagal mengunduh. Coba lagi nanti.' })
    }
  }
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const req = client.get(url, { 
      timeout: 30000,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://www.facebook.com/'
      }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return resolve(downloadBuffer(res.headers.location))
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`))
      }

      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Download timeout'))
    })
  })
}
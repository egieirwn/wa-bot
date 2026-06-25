const axios = require('axios')
const https = require('https')
const http = require('http')

// Try to require sharp for image resizing (optional)
let sharp = null
try {
  sharp = require('sharp')
} catch (e) {
  console.log('Sharp not installed - image resize disabled')
}

module.exports = {
  name: 'twt',
  description: 'Download video/GIF/foto dari Twitter. Contoh: !twt https://twitter.com/user/status/xxx',
  async execute(sock, msg, from, args) {
    const url = args[0] || ''

    if (!url) {
      return await sock.sendMessage(from, { 
        text: '❌ Masukkan URL Twitter/X.\n\nContoh:\n*!twt https://twitter.com/user/status/xxx*\n*!twt https://x.com/user/status/xxx*' 
      })
    }

    // Validasi URL Twitter/X
    const twitterRegex = /^https?:\/\/(www\.)?(twitter\.com|x\.com|mobile\.twitter\.com)\/.+/i
    if (!twitterRegex.test(url)) {
      return await sock.sendMessage(from, { 
        text: '❌ URL Twitter/X tidak valid.\n\nFormat yang diterima:\n- https://twitter.com/user/status/xxx\n- https://x.com/user/status/xxx' 
      })
    }

    await sock.sendMessage(from, { text: '⏳ Mengunduh dari Twitter/X...' })

    try {
      let mediaUrl = null
      let mediaType = null // 'video' atau 'image'

      // Coba scrap dari Twitter langsung dengan berbagai user agent
      try {
        const { data } = await axios.get(url, {
          timeout: 20000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        })

        // Cari pattern video URL di dalam HTML
        // Pattern 1: video MP4 dari pbs.twimg.com
        let match = data.match(/https:\/\/pbs\.twimg\.com\/[^\s"<>]+\.mp4/)
        if (match) {
          mediaUrl = match[0]
          mediaType = 'video'
        }

        // Pattern 2: video dari video.twimg.com
        if (!mediaUrl) {
          match = data.match(/https:\/\/video\.twimg\.com\/[^\s"<>]+\.mp4/)
          if (match) {
            mediaUrl = match[0]
            mediaType = 'video'
          }
        }

        // Pattern 3: foto/image dari pbs.twimg.com (jpg, png, webp)
        if (!mediaUrl) {
          match = data.match(/https:\/\/pbs\.twimg\.com\/[^\s"<>]+\.(jpg|jpeg|png|webp)/)
          if (match) {
            mediaUrl = match[0]
            mediaType = 'image'
          }
        }

        // Pattern 4: dari og:video
        if (!mediaUrl) {
          match = data.match(/og:video["\s]*content=["']([^"']+)["']/)
          if (match) {
            mediaUrl = match[1]
            mediaType = mediaUrl.includes('.mp4') ? 'video' : 'image'
          }
        }

        // Pattern 5: dari og:image (fallback untuk foto)
        if (!mediaUrl) {
          match = data.match(/og:image["\s]*content=["']([^"']+)["']/)
          if (match) {
            mediaUrl = match[1]
            mediaType = 'image'
          }
        }
      } catch (e) {
        console.log('Direct scrape failed:', e.message)
      }

      // Fallback ke vxtwitter API jika direct scrape gagal
      if (!mediaUrl) {
        try {
          const tweetId = url.match(/status\/(\d+)/)?.[1]
          if (tweetId) {
            const { data: apiData } = await axios.get(`https://api.vxtwitter.com/i/web/status/${tweetId}`, {
              timeout: 15000,
              headers: { 'User-Agent': 'Mozilla/5.0' }
            })
            
            if (apiData?.mediaDetails?.[0]) {
              const media = apiData.mediaDetails[0]
              mediaUrl = media.url
              mediaType = media.type === 'video' ? 'video' : 'image'
            }
          }
        } catch (e) {
          console.log('vxtwitter fallback failed:', e.message)
        }
      }

      if (!mediaUrl) {
        return await sock.sendMessage(from, { text: '❌ Media tidak ditemukan. Tweet mungkin sudah dihapus atau bersifat private.' })
      }

      // Optimize media URL untuk ukuran lebih besar
      if (mediaType === 'image' && mediaUrl.includes('pbs.twimg.com')) {
        // Twitter images support ?format=jpg&name=orig untuk full size
        // Atau ?format=jpg&name=4096x4096 untuk besar tapi bukan orig
        if (!mediaUrl.includes('?')) {
          mediaUrl = mediaUrl + '?format=jpg&name=4096x4096'
        }
      }

      // Download media buffer dengan retry
      let buffer = null
      let retries = 3

      while (!buffer && retries > 0) {
        try {
          buffer = await downloadBuffer(mediaUrl, mediaType)
          break
        } catch (e) {
          retries--
          if (retries === 0) throw e
          console.log(`Download retry... (${retries} attempts left)`)
          await new Promise(r => setTimeout(r, 1000))
        }
      }

      if (!buffer) {
        return await sock.sendMessage(from, { text: '❌ Gagal download media. Coba lagi nanti.' })
      }

      // Resize image jika sharp tersedia
      if (mediaType === 'image' && sharp) {
        try {
          // Resize image ke ukuran lebih besar (scale up) dengan quality normal
          const resizedBuffer = await sharp(buffer)
            .resize(1024, 1024, {
              fit: 'cover',
              withoutEnlargement: false // Allow upscaling
            })
            .jpeg({ quality: 85 }) // Normal quality, bukan high res
            .toBuffer()
          
          buffer = resizedBuffer
        } catch (resizeErr) {
          console.log('Image resize failed, using original:', resizeErr.message)
          // Gunakan buffer original jika resize gagal
        }
      }

      // Kirim sesuai tipe media
      if (mediaType === 'video') {
        await sock.sendMessage(from, {
          video: buffer,
          caption: '🐦 *Twitter/X Video*',
          mimetype: 'video/mp4'
        })
      } else {
        await sock.sendMessage(from, {
          image: buffer,
          caption: '🐦 *Twitter/X Foto*',
          mimetype: 'image/jpeg'
        })
      }

    } catch (err) {
      console.error('Error twitter:', err.message)
      await sock.sendMessage(from, { text: '❌ Gagal mengunduh. Coba lagi nanti.' })
    }
  }
}

function downloadBuffer(url, mediaType = 'image') {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const req = client.get(url, { 
      timeout: 30000, 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://twitter.com/'
      },
      maxRedirects: 5
    }, (res) => {
      // Handle redirect
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        return resolve(downloadBuffer(res.headers.location, mediaType))
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

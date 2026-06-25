const crypto = require('crypto')
const axios = require('axios')
const https = require('https')
const http = require('http')
let yts
try { yts = require('yt-search') } catch (e) { yts = null }

const MAX_DURATION_SECONDS = 1800 // 30 menit

// Fungsi untuk convert timestamp ke detik
function timestampToSeconds(timestamp) {
  if (!timestamp) return 0
  
  // Jika sudah number (detik)
  if (typeof timestamp === 'number') return timestamp
  
  // Format: HH:MM:SS atau MM:SS
  const parts = String(timestamp).split(':').reverse()
  let seconds = 0
  
  if (parts.length >= 1) seconds += parseInt(parts[0]) || 0
  if (parts.length >= 2) seconds += (parseInt(parts[1]) || 0) * 60
  if (parts.length >= 3) seconds += (parseInt(parts[2]) || 0) * 3600
  
  return seconds
}

// ======= YouTube Downloader Class =======
class YouTubeDownloader {
  constructor() {
    this.key = 'C5D58EF67A7584E4A29F6C35BBC4EB12'
    this.formats = ['144', '240', '360', '480', '720', '1080', 'mp3']
    this.youtubeRegex = /^((?:https?:)?\/\/)?((?:www|m|music)\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(?:embed\/)?(?:v\/)?(?:shorts\/)?([a-zA-Z0-9_-]{11})/

    this.httpClient = axios.create({
      headers: {
        'content-type': 'application/json',
        'origin': 'https://yt.savetube.me',
        'user-agent': 'Mozilla/5.0 (Android 15; Mobile; SM-F958; rv:130.0) Gecko/130.0 Firefox/130.0'
      }
    })
  }

  async decrypt(encryptedData) {
    try {
      const source = Buffer.from(encryptedData, 'base64')
      const key = Buffer.from(this.key, 'hex')
      const iv = source.slice(0, 16)
      const data = source.slice(16)
      const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv)
      const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
      return JSON.parse(decrypted.toString())
    } catch (error) {
      throw new Error(`Decryption error: ${error.message}`)
    }
  }

  async getCDN() {
    try {
      const response = await this.httpClient.get('https://media.savetube.vip/api/random-cdn')
      return { status: true, data: response.data.cdn }
    } catch (error) {
      return { status: false, error: error.message }
    }
  }

  async getVideoInfo(url, format = 'mp3') {
    try {
      const match = url.match(this.youtubeRegex)
      if (!match) return { status: false, message: 'Invalid YouTube URL' }

      const videoId = match[3]
      if (!this.formats.includes(format)) return { status: false, message: 'Invalid format', availableFormats: this.formats }

      const cdn = await this.getCDN()
      if (!cdn.status) return cdn

      const infoResponse = await this.httpClient.post(`https://${cdn.data}/v2/info`, {
        url: `https://www.youtube.com/watch?v=${videoId}`
      })

      const decryptedInfo = await this.decrypt(infoResponse.data.data)

      const downloadResponse = await this.httpClient.post(`https://${cdn.data}/download`, {
        id: videoId,
        downloadType: format === 'mp3' ? 'audio' : 'video',
        quality: format === 'mp3' ? '128' : format,
        key: decryptedInfo.key
      })

      const downloadUrl = downloadResponse.data.data.downloadUrl

      return {
        status: true,
        title: decryptedInfo.title,
        format: format,
        thumbnail: decryptedInfo.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration: decryptedInfo.duration,
        cached: decryptedInfo.fromCache || false,
        downloadUrl: downloadUrl,
        videoId: videoId,
        videoUrl: `https://youtube.com/watch?v=${videoId}`
      }
    } catch (error) {
      return { status: false, error: error.message }
    }
  }
}

const downloader = new YouTubeDownloader()

const ytmp3 = async (url) => await downloader.getVideoInfo(url, 'mp3')
const ytmp4 = async (url, quality = '720') => {
  if (!['144', '240', '360', '480', '720', '1080'].includes(quality)) quality = '720'
  return await downloader.getVideoInfo(url, quality)
}

const play = async (query) => {
  if (!yts) return { status: false, message: 'yt-search tidak terinstall' }
  try {
    const searchResults = await yts(query)
    if (!searchResults.videos.length) return { status: false, message: 'Tidak ada hasil ditemukan' }
    const firstVideo = searchResults.videos[0]
    const downloadInfo = await ytmp3(firstVideo.url)
    if (!downloadInfo.status) return { status: false, message: 'Gagal mendapatkan info download', error: downloadInfo.error || downloadInfo.message }
    return {
      status: true,
      data: {
        title: firstVideo.title,
        duration: firstVideo.timestamp,
        thumbnail: firstVideo.thumbnail,
        downloadUrl: downloadInfo.downloadUrl,
        quality: downloadInfo.format,
        videoId: firstVideo.videoId,
        videoUrl: firstVideo.url,
        author: firstVideo.author.name
      }
    }
  } catch (error) {
    return { status: false, error: error.message }
  }
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const req = client.get(url, { timeout: 60000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) return resolve(downloadBuffer(res.headers.location))
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout')) })
  })
}
// ======= END YouTube Downloader =======

module.exports = {
  name: 'yt',
  description: 'Download YouTube. Contoh: !yt mp3 <url> | !yt 720 <url> | !yt play <judul lagu>',
  async execute(sock, msg, from, args) {
    if (args.length < 2) {
      return await sock.sendMessage(from, {
        text: `❌ Format salah!\n\nCara pakai:\n*!yt mp3 <url>* — download audio\n*!yt 720 <url>* — download video\n*!yt play <judul>* — cari & download lagu\n\nKualitas video: 144, 240, 360, 480, 720, 1080`
      })
    }

    const subCmd = args[0].toLowerCase()

    // !yt play <judul>
    if (subCmd === 'play') {
      const query = args.slice(1).join(' ')
      await sock.sendMessage(from, { text: `🔍 Mencari: *${query}*...` })

      const result = await play(query)
      if (!result.status) {
        return await sock.sendMessage(from, { text: `❌ ${result.message || result.error}` })
      }

      const { title, author, duration, downloadUrl } = result.data
      
      // Check durasi
      const durationSeconds = timestampToSeconds(duration)
      if (durationSeconds > MAX_DURATION_SECONDS) {
        const minutes = Math.floor(durationSeconds / 60)
        return await sock.sendMessage(from, { 
          text: `❌ Video terlalu panjang (${minutes} menit). Max durasi: 30 menit.` 
        })
      }

      await sock.sendMessage(from, { text: `⏳ Mengunduh: *${title}*...` })

      try {
        const buffer = await downloadBuffer(downloadUrl)
        await sock.sendMessage(from, {
          audio: buffer,
          mimetype: 'audio/mp4',
          ptt: false,
          fileName: `${title}.mp3`
        })
        await sock.sendMessage(from, {
          text: `🎵 *${title}*\n👤 ${author}\n⏱️ ${duration}`
        })
      } catch (err) {
        console.error('Error yt play:', err.message)
        await sock.sendMessage(from, { text: '❌ Gagal mengunduh audio.' })
      }
      return
    }

    // !yt mp3 <url> atau !yt 720 <url>
    const format = subCmd
    const url = args[1]
    const validFormats = ['mp3', '144', '240', '360', '480', '720', '1080']

    if (!validFormats.includes(format)) {
      return await sock.sendMessage(from, { text: `❌ Format tidak valid.\nFormat tersedia: *${validFormats.join(', ')}*` })
    }

    const ytRegex = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\/.+/i
    if (!ytRegex.test(url)) {
      return await sock.sendMessage(from, { text: '❌ URL YouTube tidak valid.' })
    }

    await sock.sendMessage(from, { text: `⏳ Mengunduh YouTube ${format === 'mp3' ? 'audio' : 'video ' + format + 'p'}...` })

    try {
      const info = format === 'mp3' ? await ytmp3(url) : await ytmp4(url, format)

      if (!info.status) {
        return await sock.sendMessage(from, { text: `❌ ${info.message || info.error}` })
      }

      // Check durasi
      const durationSeconds = timestampToSeconds(info.duration)
      if (durationSeconds > MAX_DURATION_SECONDS) {
        const minutes = Math.floor(durationSeconds / 60)
        return await sock.sendMessage(from, { 
          text: `❌ Video terlalu panjang (${minutes} menit). Max durasi: 30 menit.` 
        })
      }

      const buffer = await downloadBuffer(info.downloadUrl)

      if (format === 'mp3') {
        await sock.sendMessage(from, {
          audio: buffer,
          mimetype: 'audio/mp4',
          ptt: false,
          fileName: `${info.title}.mp3`
        })
        await sock.sendMessage(from, {
          text: `🎵 *${info.title}*\n⏱️ ${info.duration || '-'}`
        })
      } else {
        await sock.sendMessage(from, {
          video: buffer,
          caption: `🎬 *${info.title}*\n📺 Kualitas: ${format}p\n⏱️ ${info.duration || '-'}`,
          mimetype: 'video/mp4'
        })
      }

    } catch (err) {
      console.error('Error yt:', err.message)
      await sock.sendMessage(from, { text: '❌ Gagal mengunduh. Coba lagi nanti.' })
    }
  }
}

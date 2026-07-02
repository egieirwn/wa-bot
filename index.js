const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadContentFromMessage,
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const path = require('path')
const fs = require('fs')
const readline = require('readline')
const chokidar = require('chokidar')

const commands = {}
const filePathToName = new Map()
const commandsPath = path.join(__dirname, 'commands')

function loadCommand(filePath) {
  try {
    delete require.cache[require.resolve(filePath)]
    const cmd = require(filePath)

    if (!cmd || !cmd.name || typeof cmd.execute !== 'function') {
      console.error(`❌ File ${path.basename(filePath)} tidak valid (butuh .name dan .execute)`)
      return
    }

    if (filePathToName.has(filePath)) {
      const oldName = filePathToName.get(filePath)
      if (oldName !== cmd.name) delete commands[oldName]
    }

    commands[cmd.name] = cmd
    filePathToName.set(filePath, cmd.name)
    console.log(`✅ Command loaded: !${cmd.name}`)
  } catch (err) {
    console.error(`❌ Gagal load command ${filePath}:`, err.message)
  }
}

function unloadCommand(filePath) {
  try {
    const name = filePathToName.get(filePath)
    if (name) {
      delete commands[name]
      filePathToName.delete(filePath)
      console.log(`🗑️ Command unloaded: !${name}`)
    }
    try {
      delete require.cache[require.resolve(filePath)]
    } catch { }
  } catch (err) {
    console.error('Gagal unload:', err.message)
  }
}

if (!fs.existsSync(commandsPath)) {
  fs.mkdirSync(commandsPath, { recursive: true })
  console.log(`📁 Folder commands dibuat: ${commandsPath}`)
}

fs.readdirSync(commandsPath).forEach(file => {
  if (file.endsWith('.js')) loadCommand(path.join(commandsPath, file))
})

const watcher = chokidar.watch(commandsPath, {
  ignored: /(^|[\/\\])\../,
  persistent: true,
  ignoreInitial: true,
})

watcher
  .on('add', filePath => {
    if (filePath.endsWith('.js')) {
      console.log(`📁 File baru: ${path.basename(filePath)}`)
      loadCommand(filePath)
    }
  })
  .on('change', filePath => {
    if (filePath.endsWith('.js')) {
      console.log(`✏️ File diubah: ${path.basename(filePath)}`)
      loadCommand(filePath)
    }
  })
  .on('unlink', filePath => {
    if (filePath.endsWith('.js')) {
      console.log(`🗑️ File dihapus: ${path.basename(filePath)}`)
      unloadCommand(filePath)
    }
  })

const TARGET_JID = '6283169513207@s.whatsapp.net'

const msgCache = new Map()
const MAX_CACHE = 500000
const MSG_CACHE_TTL = 7 * 24 * 60 * 60 * 1000

const statusCache = new Map()
const MAX_STATUS_CACHE = 500

const processedCmdIds = new Set()
const MAX_PROCESSED = 2000

let reconnectDelay = 3000

const SUPPRESSED_ERRORS = [
  'Bad MAC',
  'closed session',
  'Decrypted message with closed session',
  'No matching sessions found for decryption',
  'Session error',
]

const logger = pino({ level: 'silent' })

function shouldSuppressError(err) {
  const text = err?.message || String(err)
  return SUPPRESSED_ERRORS.some(e => text.includes(e))
}

const question = (text) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(text, ans => {
    rl.close()
    resolve(ans)
  }))
}

function formatTime(timestamp) {
  return new Date(timestamp * 1000).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'short',
    timeStyle: 'short'
  })
}

async function downloadMedia(mediaMsg, type) {
  try {
    const stream = await downloadContentFromMessage(mediaMsg, type)
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    return Buffer.concat(chunks)
  } catch (e) {
    if (!shouldSuppressError(e)) {
      console.error(`downloadMedia gagal (${type}):`, e.message)
    }
    return null
  }
}

async function kirimStatusDihapus(sock, cached) {
  const deletedAt = formatTime(Math.floor(Date.now() / 1000))
  const uploadedAt = formatTime(cached.timestamp)
  const header = `🗑️ *Status Dihapus!*\n━━━━━━━━━━━━━━━\n👤 Dari: ${cached.senderName}\n📤 Diupload: ${uploadedAt}\n🗑️ Dihapus: ${deletedAt}\n`

  try {
    if (cached.msgType === 'text') {
      await sock.sendMessage(TARGET_JID, { text: header + `💬 ${cached.body}` })
    } else if (cached.msgType === 'image') {
      const caption = header + (cached.body ? `💬 ${cached.body}` : '')
      const buffer = await downloadMedia(cached.message.imageMessage, 'image')
      if (buffer) {
        await sock.sendMessage(TARGET_JID, { image: buffer, caption })
      } else {
        const imgUrl = cached.message.imageMessage?.url
        if (imgUrl) {
          await sock.sendMessage(TARGET_JID, { image: { url: imgUrl }, caption })
        } else {
          await sock.sendMessage(TARGET_JID, { text: header + '⚠️ Gagal download foto.' })
        }
      }
    } else if (cached.msgType === 'video') {
      const caption = header + (cached.body ? `💬 ${cached.body}` : '')
      const buffer = await downloadMedia(cached.message.videoMessage, 'video')
      if (buffer) {
        await sock.sendMessage(TARGET_JID, { video: buffer, caption })
      } else {
        const vidUrl = cached.message.videoMessage?.url
        if (vidUrl) {
          await sock.sendMessage(TARGET_JID, { video: { url: vidUrl }, caption })
        } else {
          await sock.sendMessage(TARGET_JID, { text: header + '⚠️ Gagal download video.' })
        }
      }
    } else if (cached.msgType === 'audio') {
      const buffer = await downloadMedia(cached.message.audioMessage, 'audio')
      if (buffer) {
        await sock.sendMessage(TARGET_JID, { text: header + '🎵 Status Audio' })
        await sock.sendMessage(TARGET_JID, { audio: buffer, mimetype: 'audio/mp4' })
      } else {
        await sock.sendMessage(TARGET_JID, { text: header + '⚠️ Gagal download audio.' })
      }
    }
  } catch (err) {
    console.error('Gagal kirim status dihapus:', err.message)
    await sock.sendMessage(TARGET_JID, { text: header + '⚠️ Error: ' + err.message })
  }
}

async function kirimPesanDihapus(sock, cached) {
  const deletedAt = formatTime(Math.floor(Date.now() / 1000))
  const sentAt = formatTime(cached.timestamp)
  const isGroup = cached.from.endsWith('@g.us')
  let locationName = isGroup ? 'Grup' : 'Chat Pribadi'
  if (isGroup) {
    try {
      const meta = await sock.groupMetadata(cached.from)
      locationName = meta.subject || 'Grup'
    } catch (e) { }
  }
  const header = `🗑️ *Pesan Dihapus!*\n━━━━━━━━━━━━━━━\n👤 Dari: ${cached.senderName}\n📍 Di: ${locationName}\n📤 Dikirim: ${sentAt}\n🗑️ Dihapus: ${deletedAt}\n`

  try {
    if (cached.msgType === 'text') {
      await sock.sendMessage(TARGET_JID, { text: header + `💬 ${cached.body}` })
    } else if (cached.msgType === 'image') {
      const buffer = await downloadMedia(cached.message.imageMessage, 'image')
      if (buffer) {
        await sock.sendMessage(TARGET_JID, { image: buffer, caption: header + (cached.body ? `💬 ${cached.body}` : '🖼️ Foto') })
      } else {
        await sock.sendMessage(TARGET_JID, { text: header + '🖼️ Foto (gagal diunduh)' })
      }
    } else if (cached.msgType === 'video') {
      const buffer = await downloadMedia(cached.message.videoMessage, 'video')
      if (buffer) {
        await sock.sendMessage(TARGET_JID, { video: buffer, caption: header + (cached.body ? `💬 ${cached.body}` : '🎥 Video') })
      } else {
        await sock.sendMessage(TARGET_JID, { text: header + '🎥 Video (gagal diunduh)' })
      }
    } else if (cached.msgType === 'audio') {
      const buffer = await downloadMedia(cached.message.audioMessage, 'audio')
      if (buffer) {
        await sock.sendMessage(TARGET_JID, { audio: buffer, mimetype: 'audio/mp4' })
        await sock.sendMessage(TARGET_JID, { text: header + '🎵 Audio' })
      } else {
        await sock.sendMessage(TARGET_JID, { text: header + '🎵 Audio (gagal diunduh)' })
      }
    } else if (cached.msgType === 'sticker') {
      const buffer = await downloadMedia(cached.message.stickerMessage, 'sticker')
      if (buffer) {
        await sock.sendMessage(TARGET_JID, { text: header + '🎭 Stiker' })
        await sock.sendMessage(TARGET_JID, { sticker: buffer })
      } else {
        await sock.sendMessage(TARGET_JID, { text: header + '🎭 Stiker (gagal diunduh)' })
      }
    } else if (cached.msgType === 'document') {
      const docMsg = cached.message.documentMessage
      const buffer = await downloadMedia(docMsg, 'document')
      if (buffer) {
        await sock.sendMessage(TARGET_JID, { text: header + `📄 Dokumen: ${docMsg.fileName || 'Tidak ada nama'}` })
        await sock.sendMessage(TARGET_JID, {
          document: buffer,
          mimetype: docMsg.mimetype || 'application/octet-stream',
          fileName: docMsg.fileName || 'dokumen'
        })
      } else {
        await sock.sendMessage(TARGET_JID, { text: header + '📄 Dokumen (gagal diunduh)' })
      }
    } else {
      await sock.sendMessage(TARGET_JID, { text: header + `📎 Tipe: ${cached.msgType}` })
    }
  } catch (err) {
    console.error('Gagal kirim pesan dihapus:', err.message)
    await sock.sendMessage(TARGET_JID, { text: header + '⚠️ Media gagal diunduh.' })
  }
}

function cacheMessage(msg) {
  if (!msg.message) return

  const msgId = msg.key.id
  const from = msg.key.remoteJid
  const sender = msg.key.participant || from
  const senderName = msg.pushName || sender.split('@')[0]
  const m = msg.message

  if (m?.protocolMessage) return

  if (from === 'status@broadcast') {
    const statusType =
      m?.imageMessage ? 'image' :
        m?.videoMessage ? 'video' :
          m?.extendedTextMessage ? 'text' :
            m?.conversation ? 'text' :
              m?.audioMessage ? 'audio' : null

    if (statusType) {
      const body = m?.conversation || m?.extendedTextMessage?.text || m?.imageMessage?.caption || m?.videoMessage?.caption || ''
      if (!statusCache.has(msgId)) {
        statusCache.set(msgId, { sender, senderName, msgType: statusType, body, message: m, timestamp: msg.messageTimestamp })
        if (statusCache.size > MAX_STATUS_CACHE) {
          const firstKey = statusCache.keys().next().value
          statusCache.delete(firstKey)
        }
        console.log(`📸 Status disimpan dari @${senderName} (${statusType})`)
      }
    }
    return
  }

  const body = m?.conversation || m?.extendedTextMessage?.text || m?.imageMessage?.caption || m?.videoMessage?.caption || m?.documentMessage?.caption || ''
  const msgType =
    m?.conversation ? 'text' :
      m?.extendedTextMessage ? 'text' :
        m?.imageMessage ? 'image' :
          m?.videoMessage ? 'video' :
            m?.audioMessage ? 'audio' :
              m?.stickerMessage ? 'sticker' :
                m?.documentMessage ? 'document' : 'unknown'

  if (!msgCache.has(msgId)) {
    msgCache.set(msgId, {
      from, sender, senderName, body, msgType,
      message: m,
      timestamp: msg.messageTimestamp,
      cachedAt: Date.now(),
    })

    if (msgCache.size > MAX_CACHE) {
      const now = Date.now()
      for (const [key, val] of msgCache.entries()) {
        if (now - val.cachedAt > MSG_CACHE_TTL) {
          msgCache.delete(key)
        }
      }
      while (msgCache.size > MAX_CACHE) {
        const firstKey = msgCache.keys().next().value
        msgCache.delete(firstKey)
      }
    }
  }
}

async function handleMessage(sock, msg, isNewMsg = true) {
  if (!msg.message) return

  const msgId = msg.key.id
  const from = msg.key.remoteJid
  const m = msg.message

  if (from === 'status@broadcast') {
    if (m?.protocolMessage?.type === 0) {
      const deletedMsgId = m.protocolMessage.key?.id
      console.log(`🗑️ Status dihapus — id: ${deletedMsgId}`)
      if (statusCache.has(deletedMsgId)) {
        const cached = statusCache.get(deletedMsgId)
        console.log(`🗑️ Mengirim status dihapus dari ${cached.senderName}`)
        await kirimStatusDihapus(sock, cached)
        statusCache.delete(deletedMsgId)
      } else {
        console.log(`⚠️ id ${deletedMsgId} tidak ada di cache`)
      }
    }
    return
  }

  if (m?.protocolMessage?.type === 0) {
    const deletedMsgId = m.protocolMessage.key?.id
    if (msgCache.has(deletedMsgId)) {
      const cached = msgCache.get(deletedMsgId)
      if (Date.now() - cached.cachedAt <= MSG_CACHE_TTL) {
        console.log(`🗑️ Pesan dihapus oleh ${cached.senderName}`)
        await kirimPesanDihapus(sock, cached)
      }
      msgCache.delete(deletedMsgId)
    } else {
      console.log(`⚠️ Pesan dihapus tapi tidak ada di cache — id: ${deletedMsgId}`)
    }
    return
  }

  if (!isNewMsg) return

  const body = m?.conversation || m?.extendedTextMessage?.text || m?.imageMessage?.caption || m?.videoMessage?.caption || m?.documentMessage?.caption || ''
  if (!body.startsWith('!')) return

  if (processedCmdIds.has(msgId)) return
  processedCmdIds.add(msgId)
  if (processedCmdIds.size > MAX_PROCESSED) {
    const first = processedCmdIds.values().next().value
    processedCmdIds.delete(first)
  }

  const args = body.slice(1).trim().split(/\s+/).filter(Boolean)
  const commandName = args.shift()?.toLowerCase()
  if (!commandName) return

  if (commands[commandName]) {
    try {
      await commands[commandName].execute(sock, msg, from, args)
    } catch (err) {
      console.error('Error:', err)
      try {
        await sock.sendMessage(from, { text: '❌ Terjadi error saat menjalankan command.' })
      } catch { }
    }
  } else {
    try {
      await sock.sendMessage(from, { text: `Command *!${commandName}* tidak ditemukan. Ketik *!help* untuk daftar command.` })
    } catch { }
  }
}

async function startBot() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      browser: ['Ubuntu', 'Chrome', '120.0.0'],
      printQRInTerminal: false,
      readIncomingMessages: false,
      getMessage: async (key) => {
        const cached = msgCache.get(key.id)
        if (cached?.message) return cached.message
        return { conversation: '' }
      },
    })

    if (!sock.authState.creds.registered) {
      let nomor = await question('Masukkan nomor WhatsApp (contoh: 6281234567890): ')
      nomor = nomor.replace(/\D/g, '')
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(nomor)
          const formatted = code?.match(/.{1,4}/g)?.join('-') || code
          console.log(`\n✅ Pairing Code kamu: ${formatted}`)
          console.log('Buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat > Masukkan kode\n')
        } catch (e) {
          console.error('Gagal request pairing code:', e.message)
        }
      }, 3000)
    }

    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode
        if (code === DisconnectReason.loggedOut) {
          console.log('❌ Logged out! Hapus folder auth_info lalu restart.')
          process.exit(0)
        } else {
          console.log(`🔄 Reconnecting dalam ${reconnectDelay / 1000}s...`)
          setTimeout(startBot, reconnectDelay)
          reconnectDelay = Math.min(reconnectDelay * 2, 60000)
        }
      } else if (connection === 'open') {
        console.log('✅ Bot berhasil terhubung!')
        reconnectDelay = 3000
      }
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      const isNewMsg = type === 'notify'

      for (const msg of messages) {
        try {
          cacheMessage(msg)
        } catch (err) {
          if (!shouldSuppressError(err)) {
            console.error('cacheMessage error:', err.message)
          }
        }
      }

      for (const msg of messages) {
        handleMessage(sock, msg, isNewMsg).catch(err => {
          if (!shouldSuppressError(err)) {
            console.error('handleMessage error:', err.message)
          }
        })
      }
    })
  } catch (err) {
    console.error('❌ Gagal start bot:', err.message)
    console.log(`🔄 Retry dalam ${reconnectDelay / 1000}s...`)
    setTimeout(startBot, reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 2, 60000)
  }
}

const MAX_RAM_BYTES = 1 * 1024 * 1024 * 1024
setInterval(() => {
  const now = Date.now()
  let expiredCount = 0
  for (const [key, val] of msgCache.entries()) {
    if (now - val.cachedAt > MSG_CACHE_TTL) {
      msgCache.delete(key)
      expiredCount++
    }
  }
  if (expiredCount > 0) {
    console.log(`🧹 TTL cleanup: ${expiredCount} pesan expired dibersihkan`)
  }

  const used = process.memoryUsage().rss
  if (used > MAX_RAM_BYTES) {
    console.log(`⚠️ RAM bot ${(used / 1024 / 1024).toFixed(0)}MB, auto cleanup cache...`)
    const deleteCount = Math.floor(msgCache.size * 0.3)
    const keys = Array.from(msgCache.keys()).slice(0, deleteCount)
    keys.forEach(k => msgCache.delete(k))
    const statusDeleteCount = Math.floor(statusCache.size * 0.3)
    const statusKeys = Array.from(statusCache.keys()).slice(0, statusDeleteCount)
    statusKeys.forEach(k => statusCache.delete(k))
    console.log(`🧹 Cache dibersihkan: ${deleteCount} pesan, ${statusDeleteCount} status`)
  }
}, 5 * 60 * 1000)

process.on('unhandledRejection', (err) => {
  if (!shouldSuppressError(err)) {
    console.error('Unhandled rejection:', err?.message || err)
  }
})

process.on('uncaughtException', (err) => {
  if (!shouldSuppressError(err)) {
    console.error('Uncaught exception:', err?.message || err)
  }
})

startBot()

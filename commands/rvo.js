const { downloadContentFromMessage } = require('@whiskeysockets/baileys')

module.exports = {
  name: 'rvo',
  description: 'Buka pesan view once (reply pesan view once)',
  async execute(sock, msg, from, args) {
    const botJid = '6283169513207@s.whatsapp.net'
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo
    const quoted = contextInfo?.quotedMessage

    if (!quoted) {
      return await sock.sendMessage(from, { text: '❌ Reply pesan view once dulu, lalu ketik *!rvo*' })
    }

    const viewOnceMsg =
      quoted?.viewOnceMessageV2?.message ||
      quoted?.viewOnceMessage?.message ||
      quoted?.viewOnceMessageV2Extension?.message ||
      quoted?.viewOnceMessageExtension?.message

    const rawImage = quoted?.imageMessage
    const rawVideo = quoted?.videoMessage
    const rawAudio = quoted?.audioMessage

    let mediaMsg = null
    let mediaType = null

    if (viewOnceMsg) {
      mediaType = Object.keys(viewOnceMsg)[0]
      mediaMsg = viewOnceMsg[mediaType]
    } else if (rawImage?.viewOnce) {
      mediaType = 'imageMessage'
      mediaMsg = rawImage
    } else if (rawVideo?.viewOnce) {
      mediaType = 'videoMessage'
      mediaMsg = rawVideo
    } else if (rawAudio?.viewOnce) {
      mediaType = 'audioMessage'
      mediaMsg = rawAudio
    }

    if (!mediaMsg) {
      return await sock.sendMessage(from, { text: '❌ Pesan yang direply bukan view once atau tipe tidak didukung.' })
    }

    try {
      const stream = await downloadContentFromMessage(mediaMsg, mediaType.replace('Message', ''))
      const chunks = []
      for await (const chunk of stream) chunks.push(chunk)
      const buffer = Buffer.concat(chunks)

      if (mediaType === 'imageMessage') {
        await sock.sendMessage(botJid, {
          image: buffer,
          caption: '👁️ *View once foto*'
        })
      } else if (mediaType === 'videoMessage') {
        await sock.sendMessage(botJid, {
          video: buffer,
          caption: '👁️ *View once video*'
        })
      } else if (mediaType === 'audioMessage') {
        await sock.sendMessage(botJid, {
          audio: buffer,
          mimetype: 'audio/mp4',
          ptt: mediaMsg.ptt || false
        })
      }
    } catch (err) {
      console.error('Error rvo:', err)
      await sock.sendMessage(from, { text: '❌ Gagal mengunduh media.' })
    }
  }
}

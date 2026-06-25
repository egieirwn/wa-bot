const sharp = require('sharp')

module.exports = {
  name: 'sticker',
  description: 'Ubah foto/video jadi stiker',
  async execute(sock, msg, from, args) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    const imageMsg =
      msg.message?.imageMessage ||
      quoted?.imageMessage

    if (!imageMsg) {
      return await sock.sendMessage(from, { text: '❌ Kirim/reply foto dengan caption *!sticker*' })
    }

    await sock.sendMessage(from, { text: '⏳ Membuat stiker...' })

    const { downloadContentFromMessage } = require('@whiskeysockets/baileys')
    const stream = await downloadContentFromMessage(imageMsg, 'image')
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    const buffer = Buffer.concat(chunks)

    // Resize ke 512x512 (standar stiker WA) tanpa merusak rasio gambar asli (fit contain) dengan background transparan
    const webp = await sharp(buffer)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .webp()
      .toBuffer()

    await sock.sendMessage(from, {
      sticker: webp
    })
  }
}
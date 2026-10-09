// Helper: Hitung selisih waktu untuk jam spesifik WIB (Asia/Jakarta, UTC+7)
function parseWIBTarget(targetHour, targetMinute) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(now);
  const map = {};
  parts.forEach(p => map[p.type] = p.value);

  const y = parseInt(map.year);
  const m = parseInt(map.month) - 1;
  const d = parseInt(map.day);

  // Hitung target time hari ini di UTC (WIB = UTC+7)
  let targetMs = Date.UTC(y, m, d, targetHour - 7, targetMinute, 0);

  // Jika waktu hari ini sudah lewat, jadwalkan untuk besok
  let isTomorrow = false;
  if (targetMs <= now.getTime()) {
    targetMs = Date.UTC(y, m, d + 1, targetHour - 7, targetMinute, 0);
    isTomorrow = true;
  }

  const diffMs = targetMs - now.getTime();
  const targetDate = new Date(targetMs);

  return {
    diffMs,
    targetDate,
    isTomorrow,
    targetDateStr: targetDate.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'full',
      timeStyle: 'short'
    }) + ' WIB'
  };
}

// Helper: Format sisa waktu menjadi string yang mudah dibaca
function formatDuration(ms) {
  const totalSec = Math.round(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const parts = [];
  if (days > 0) parts.push(`${days} hari`);
  if (hours > 0) parts.push(`${hours} jam`);
  if (mins > 0) parts.push(`${mins} menit`);
  if (secs > 0 && days === 0 && hours === 0) parts.push(`${secs} detik`);

  return parts.length > 0 ? parts.join(' ') : 'kurang dari 1 menit';
}

module.exports = {
  name: 'remind',
  description: 'Set pengingat waktu atau durasi. Contoh: !remind 12.00 Ultah teman / !remind 10m Makan siang',
  _reminders: new Map(),
  _nextId: 1,

  async execute(sock, msg, from, args) {
    if (!args.length) {
      return await sock.sendMessage(from, {
        text: '⏰ *CARA PENGGUNAAN PENGINGAT (REMIND)*\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
          '📌 *1. Berdasarkan Jam Spesifik (WIB):*\n' +
          '◦ *!remind 12.00 Ada acara ultah*\n' +
          '◦ *!remind 12:30 Sholat Dzuhur*\n' +
          '◦ *!remind 08.00 Kuliah pagi*\n' +
          '_(Jika jam sudah lewat hari ini, otomatis diset untuk besok)_\n\n' +
          '📌 *2. Berdasarkan Durasi Relatif:*\n' +
          '◦ *!remind 10m Makan siang* — 10 menit\n' +
          '◦ *!remind 2h Meeting penting* — 2 jam\n' +
          '◦ *!remind 30s Cek masakan* — 30 detik\n' +
          '◦ *!remind 1d Bayar tagihan* — 1 hari \n\n' +
          '📌 *3. Kelola Pengingat:*\n' +
          '◦ *!remind list* — Lihat semua pengingat aktif\n' +
          '◦ *!remind cancel [nomor]* — Batalkan pengingat\n\n' +
          '💡 _Bisa juga via Jarvis: "jarvis ingatkan di jam 12.00 ada acara ultah"_'
      }, { quoted: msg });
    }

    // Sub-command: list
    if (args[0].toLowerCase() === 'list') {
      return await this._listReminders(sock, msg, from);
    }

    // Sub-command: cancel
    if (args[0].toLowerCase() === 'cancel') {
      const id = parseInt(args[1]);
      return await this._cancelReminder(sock, msg, from, id);
    }

    // Tangani jika ada kata "jam" di awal argumen: !remind jam 12.00 ...
    let timeArg = args[0].toLowerCase();
    let textStartIndex = 1;
    if (timeArg === 'jam' && args.length > 1) {
      timeArg = args[1].toLowerCase();
      textStartIndex = 2;
    }

    let ms = 0;
    let timeLabel = '';
    let targetDateStr = '';

    // 1. Cek apakah format jam spesifik: e.g. "12.00", "12:00", "8.30", "08:30"
    const clockMatch = timeArg.match(/^(\d{1,2})[:.](\d{2})$/);
    if (clockMatch) {
      const hour = parseInt(clockMatch[1]);
      const minute = parseInt(clockMatch[2]);

      if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return await sock.sendMessage(from, {
          text: '❌ Format jam tidak valid!\nJam harus antara *00.00* s/d *23.59* WIB.'
        }, { quoted: msg });
      }

      const wibInfo = parseWIBTarget(hour, minute);
      ms = wibInfo.diffMs;
      targetDateStr = wibInfo.targetDateStr;
      timeLabel = `Pukul ${String(hour).padStart(2, '0')}.${String(minute).padStart(2, '0')} WIB (${wibInfo.isTomorrow ? 'Besok' : 'Hari ini'})`;
    } else {
      // 2. Cek apakah format durasi relatif: e.g. "10m", "2h", "30s", "1d"
      const durationMatch = timeArg.match(/^(\d+)(s|m|h|d|detik|menit|jam|hari)$/);
      if (!durationMatch) {
        return await sock.sendMessage(from, {
          text: '❌ Format waktu salah!\n\n' +
            'Gunakan format:\n' +
            '◦ Jam spesifik: *12.00*, *12:30*, *08.00*\n' +
            '◦ Durasi: *10m*, *2h*, *30s*, *1d*\n\n' +
            'Contoh: *!remind 12.00 Ada acara ultah*'
        }, { quoted: msg });
      }

      const value = parseInt(durationMatch[1]);
      const unit = durationMatch[2];

      switch (unit) {
        case 's': case 'detik':
          ms = value * 1000;
          timeLabel = `${value} detik `;
          break;
        case 'm': case 'menit':
          ms = value * 60 * 1000;
          timeLabel = `${value} menit`;
          break;
        case 'h': case 'jam':
          ms = value * 60 * 60 * 1000;
          timeLabel = `${value} jam`;
          break;
        case 'd': case 'hari':
          ms = value * 24 * 60 * 60 * 1000;
          timeLabel = `${value} hari`;
          break;
        default:
          ms = value * 60 * 1000;
          timeLabel = `${value} menit`;
      }

      const targetDate = new Date(Date.now() + ms);
      targetDateStr = targetDate.toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        dateStyle: 'full',
        timeStyle: 'short'
      }) + ' WIB';
    }

    // Batasan waktu
    if (ms > 7 * 24 * 60 * 60 * 1000) {
      return await sock.sendMessage(from, {
        text: '❌ Maksimal waktu pengingat adalah *7 hari* ke depan.'
      }, { quoted: msg });
    }

    if (ms < 5000) {
      return await sock.sendMessage(from, {
        text: '❌ Minimal waktu pengingat adalah *5 detik*.'
      }, { quoted: msg });
    }

    // Ambil teks pesan pengingat
    const reminderText = args.slice(textStartIndex).join(' ').trim() || 'Pengingat dari bot!';

    // Ambil info pengirim
    const sender = msg.key.participant || msg.key.remoteJid;
    const senderName = msg.pushName || sender.split('@')[0];

    const id = this._nextId++;

    // Pasang timer
    const timer = setTimeout(async () => {
      try {
        const mentionTag = sender.includes('@') ? sender : `${sender}@s.whatsapp.net`;
        await sock.sendMessage(from, {
          text: `⏰ *PENGINGAT BERBUNYI!*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `👤 *Untuk:* @${mentionTag.split('@')[0]}\n` +
            `📝 *Pesan:* ${reminderText}\n` +
            `🔔 *Jadwal:* ${timeLabel}`,
          mentions: [mentionTag]
        });
      } catch (e) {
        console.error('Error saat mengirim pengingat:', e.message);
      }
      this._reminders.delete(id);
    }, ms);

    // Simpan ke memory
    this._reminders.set(id, {
      id,
      timer,
      text: reminderText,
      sender,
      senderName,
      chatId: from,
      timeLabel,
      createdAt: new Date(),
      fireAt: new Date(Date.now() + ms)
    });

    await sock.sendMessage(from, { react: { text: '⏰', key: msg.key } });
    await sock.sendMessage(from, {
      text: `✅ *Pengingat #${id} berhasil diset!*\n\n` +
        `📝 *Pesan:* ${reminderText}\n` +
        `🔔 *Jadwal:* ${timeLabel}\n` +
        `📅 *Waktu:* ${targetDateStr}\n` +
        `⏱️ *Hitung Mundur:* ~${formatDuration(ms)}`
    }, { quoted: msg });
  },

  async _listReminders(sock, msg, from) {
    const activeReminders = [...this._reminders.values()].filter(r => r.chatId === from);

    if (activeReminders.length === 0) {
      return await sock.sendMessage(from, {
        text: '📋 Tidak ada pengingat aktif di chat ini.'
      }, { quoted: msg });
    }

    let text = '📋 *DAFTAR PENGINGAT AKTIF*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    for (const r of activeReminders) {
      const timeLeft = Math.max(0, r.fireAt - Date.now());
      text += `◦ *#${r.id}* — ${r.text}\n`;
      text += `  👤 ${r.senderName} | 🔔 ${r.timeLabel} (~${formatDuration(timeLeft)})\n\n`;
    }
    text += `_Batalkan dengan: *!remind cancel [nomor]*_`;

    await sock.sendMessage(from, { text }, { quoted: msg });
  },

  async _cancelReminder(sock, msg, from, id) {
    if (!id || isNaN(id)) {
      return await sock.sendMessage(from, {
        text: '❌ Masukkan nomor pengingat yang ingin dibatalkan.\nContoh: *!remind cancel 1*'
      }, { quoted: msg });
    }

    const reminder = this._reminders.get(id);
    if (!reminder || reminder.chatId !== from) {
      return await sock.sendMessage(from, {
        text: `❌ Pengingat #${id} tidak ditemukan di chat ini.`
      }, { quoted: msg });
    }

    clearTimeout(reminder.timer);
    this._reminders.delete(id);

    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
    await sock.sendMessage(from, {
      text: `✅ Pengingat #${id} (*${reminder.text}*) berhasil dibatalkan.`
    }, { quoted: msg });
  }
};

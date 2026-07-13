#!/bin/bash

# Pastikan script berhenti jika terjadi error
set -e

echo "=============================================="
echo "   🔄 ANTIGRAVITY BOT - AUTO UPDATE SCRIPT   "
echo "=============================================="
echo ""

# 1. Tarik pembaruan kode terbaru dari GitHub
echo "📥 1. Menarik kode terbaru dari GitHub..."
git pull origin main

# 2. Bangun ulang image Docker dan restart container
# Parameter --build memaksa pembuatan ulang dengan kode yang baru ditarik
# Parameter -d menjalankan container di latar belakang
echo "⚙️ 2. Membangun ulang dan me-restart container Docker..."
docker compose up -d --build

# 3. Bersihkan sisa-sisa image lama (dangling images) agar penyimpanan server tidak penuh
echo "🧹 3. Membersihkan berkas cache Docker yang tidak terpakai..."
docker image prune -f

echo ""
echo "=============================================="
echo "🎉 Update Sukses! Bot Anda sudah versi terbaru."
echo "=============================================="
echo "ℹ️ Untuk memantau log bot, ketik: docker compose logs -f"
echo "=============================================="

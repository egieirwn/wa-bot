#!/bin/bash

# Pastikan script berhenti jika terjadi error
set -e

echo "=============================================="
echo "      🔄 JARVIS BOT - AUTO UPDATE SCRIPT      "
echo "=============================================="
echo ""

# 1. Simpan perubahan lokal sementara (jika ada) untuk mencegah konflik git pull
echo "📦 1. Mengamankan perubahan lokal..."
git stash || true
git pull origin main
git stash pop || true

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

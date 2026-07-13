@echo off
title Antigravity Bot - Auto Update Script
color 0B

echo ==============================================
echo    ^Length: 44 ^- ANTIGRAVITY BOT - AUTO UPDATE SCRIPT
echo ==============================================
echo.

:: 1. Tarik pembaruan kode terbaru dari GitHub
echo [1/3] Menarik kode terbaru dari GitHub...
git pull origin main
echo.

:: 2. Bangun ulang image Docker dan restart container
echo [2/3] Membangun ulang dan me-restart container Docker...
docker compose up -d --build
echo.

:: 3. Bersihkan sisa-sisa image lama agar penyimpanan tidak penuh
echo [3/3] Membersihkan berkas cache Docker yang tidak terpakai...
docker image prune -f
echo.

echo ==============================================
echo OK: Update Sukses! Bot Anda sudah versi terbaru.
echo ==============================================
echo Ketik "docker compose logs -f" untuk melihat log aktivitas bot.
echo.
pause

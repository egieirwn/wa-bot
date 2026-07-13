# Gunakan image Node.js slim sebagai base image yang ringan dan stabil
FROM node:20-slim

# Install dependensi sistem yang mungkin dibutuhkan oleh paket native
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Tentukan working directory di dalam container
WORKDIR /app

# Salin file package.json dan pasang dependensi Node.js
COPY package.json ./
RUN npm install --omit=dev

# Salin seluruh kode aplikasi bot ke dalam container
COPY . .

# Jalankan perintah untuk memulai bot
CMD ["node", "index.js"]

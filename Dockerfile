# syntax=docker/dockerfile:1

# ==========================================
# Stage 1: Production Dependencies Build Stage
# ==========================================
FROM node:20-alpine AS deps

# Install dependensi sistem di stage builder saja untuk mengantisipasi kompilasi modul native (seperti sharp di arsitektur ARM64/VPS)
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Salin file package.json dan package-lock.json jika tersedia
COPY package*.json ./

# Install dependensi produksi saja, matikan audit/fund untuk kecepatan, dan bersihkan cache npm secara paksa
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ==========================================
# Stage 2: Lightweight Runtime Stage
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

# Atur environment produksi
ENV NODE_ENV=production

# Salin folder node_modules produksi yang bersih dari stage deps (tanpa compiler tools g++ dll)
COPY --from=deps /app/node_modules ./node_modules

# Salin sisa file kode aplikasi
COPY . .

# Jalankan bot
CMD ["node", "index.js"]

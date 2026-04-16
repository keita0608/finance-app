# ---- ビルドステージ ----
FROM node:22-slim AS builder

WORKDIR /app

# 依存関係のインストール（キャッシュ効率化）
COPY package.json package-lock.json ./
RUN npm ci

# ソースコードをコピーしてビルド
COPY . .
RUN npm run build

# ---- 本番ステージ ----
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# 本番依存関係のみインストール
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ビルド成果物をコピー
COPY --from=builder /app/build ./build

# Cloud Run はポート 8080 を使用する
ENV PORT=8080
EXPOSE 8080

CMD ["node", "build/index.js"]

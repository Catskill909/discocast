# DiscoCast promo — standalone Node container.
# Serves the promo page AND counts page views + per-OS downloads itself.
FROM node:24-alpine
WORKDIR /app

# curl for Coolify/Docker healthchecks
RUN apk add --no-cache curl

# Install prod deps only. sharp pulls its prebuilt musl libvips binary for the
# build arch here, so it must run inside the alpine image (not be copied in).
COPY package*.json ./
RUN npm install --omit=dev

# App code + promo assets (page, images, installers)
COPY . .

# Counters live on a mounted volume in production so they survive redeploys.
# In Coolify: add a persistent volume mounted at /data and set DATA_DIR=/data.
ENV DATA_DIR=/data
VOLUME ["/data"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:3000/healthz || exit 1

CMD ["node", "server.js"]

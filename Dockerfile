# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS deps
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV CHROME_PATH=/usr/bin/chromium
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    lsb-release \
    xdg-utils \
    libxss1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /app/.wwebjs_auth && chown -R node:node /app

USER node
EXPOSE 8080
VOLUME ["/app/.wwebjs_auth"]

# Único container usa este volume, então um .pid órfão de um shutdown não
# limpo (ex: SIGKILL após stop_grace_period) só travaria o próximo boot com
# um falso "session in use" -- remover é seguro aqui.
CMD ["sh", "-c", "rm -f /app/.wwebjs_auth/*.pid; exec npm start"]

FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && pip3 install --no-cache-dir --break-system-packages yt-dlp

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

CMD ["npm", "start"]

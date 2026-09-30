FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && pip3 install --no-cache-dir --break-system-packages yt-dlp faster-whisper

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Download the speech-to-text model at build time so the first import is fast.
ARG WHISPER_MODEL=small
ENV WHISPER_MODEL=${WHISPER_MODEL}
RUN python3 -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"

CMD ["npm", "start"]

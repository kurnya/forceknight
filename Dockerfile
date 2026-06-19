FROM node:20-slim

# Install ffmpeg (needed for audio/video processing)
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files first (faster rebuilds)
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Hugging Face Spaces requires port 7860
ENV PORT=7860

EXPOSE 7860

CMD ["node", "src/index.js"]

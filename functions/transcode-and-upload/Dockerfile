# Use Node.js 20 slim as base
FROM node:20-slim

# Install FFmpeg
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Copy built source
COPY dist/ ./dist/

# Set the entrypoint for Cloud Run / Cloud Functions gen2
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]

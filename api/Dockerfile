# SkinSentry API Server Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install native dependencies for build and health check
RUN apk add --no-cache curl python3 make g++

COPY package*.json ./

RUN npm ci --omit=dev

COPY src/ ./src/
COPY scripts/ ./scripts/
COPY config/ ./config/

EXPOSE 5000

ENV NODE_ENV=production \
    PORT=5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

CMD ["node", "src/server.js"]

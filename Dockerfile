# Multi-stage Dockerfile for Modular Mobile ERP

# Stage 1: Build Frontend
FROM node:22-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Build Server
FROM node:22-alpine AS server-builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# Stage 3: Production Runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

# Install dependencies for SQLite build if required
RUN apk add --no-cache python3 make g++

WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --only=production

COPY --from=server-builder /app/server/dist ./dist
COPY --from=server-builder /app/server/src/db ./src/db
COPY --from=client-builder /app/client/dist /app/client/dist

# Create storage directories
RUN mkdir -p /app/server/data /app/server/backups

EXPOSE 5000

CMD ["node", "dist/index.js"]

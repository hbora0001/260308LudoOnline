# Use Node.js 18 LTS
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy all package files
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install all dependencies (including dev deps needed to build client)
RUN npm ci

# Copy client source
COPY client/ ./client/

# Build the client
RUN npm --prefix client run build

# Copy server source
COPY server/src ./server/src

# Copy built client to server dist using Node.js (cross-platform)
COPY scripts/ ./scripts/
RUN node scripts/copy-dist.js

# Remove dev dependencies and keep only production
RUN npm ci --omit=dev && npm ci --prefix server

# Expose port
EXPOSE 4000

# Start the application
CMD ["npm", "--prefix", "server", "start"]
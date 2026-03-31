# Use Node.js 18 LTS
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy all package files
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install dependencies
RUN npm ci && npm --prefix client ci && npm --prefix server ci

# Copy source code
COPY client/ ./client/
COPY server/src ./server/src
COPY scripts/ ./scripts/

# Build the client
RUN npm --prefix client run build

# Copy built client to server dist
RUN node scripts/copy-dist.js

# Verify dist directory
RUN ls -la server/dist/ || echo "Warning: server/dist not found"

# Clean up dev dependencies to reduce image size
RUN npm prune --omit=dev --prefix client && npm prune --omit=dev

# Expose port
EXPOSE 4000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4000

# Start the server
CMD ["node", "server/src/index.js"]
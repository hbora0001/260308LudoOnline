# Use Node.js 18 LTS
FROM node:18-alpine

# Add build argument for cache busting
ARG BUILD_TIMESTAMP=0

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

# Build the client (cache busting with timestamp)
RUN echo "Build timestamp: ${BUILD_TIMESTAMP}" && npm --prefix client run build

# Debug: Show what was built
RUN echo "=== Client dist contents ===" && ls -la client/dist/ && echo "=== End client dist ===" && du -sh client/dist/

# Copy built client to server dist
RUN node scripts/copy-dist.js

# Debug: Show what was copied
RUN echo "=== Server dist contents ===" && ls -la server/dist/ && echo "=== End server dist ===" && du -sh server/dist/

# Clean up dev dependencies to reduce image size
RUN npm prune --omit=dev --prefix client && npm prune --omit=dev

# Expose port (Railway may override)
EXPOSE 4000 8080

# Set environment variables
ENV NODE_ENV=production

# Start the server
CMD ["node", "server/src/index.js"]
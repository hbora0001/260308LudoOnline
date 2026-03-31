# Use Node.js 18 LTS
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy all package files
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install root dependencies
RUN npm ci

# Install server dependencies (production only)
RUN cd server && npm ci --only=production

# Copy client source
COPY client/ ./client/

# Build the client
RUN npm --prefix client run build

# Copy server source
COPY server/src ./server/src

# Copy built client to server dist
RUN cp -r client/dist server/

# Expose port
EXPOSE 4000

# Start the application
CMD ["npm", "--prefix", "server", "start"]
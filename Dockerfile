# Use Node.js 18 LTS
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY server/package*.json ./server/
COPY package*.json ./

# Install dependencies
RUN cd server && npm ci --only=production

# Copy built application
COPY server/ ./server/

# Expose port
EXPOSE 4000

# Start the application
CMD ["npm", "start"]
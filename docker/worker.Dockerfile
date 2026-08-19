FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY workers/ai/package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy source code
COPY workers/ai/src ./src

# Start the worker
CMD ["node", "src/index.js"]

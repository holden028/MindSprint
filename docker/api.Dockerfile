FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY apps/api/package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy source code and SQL migrations
COPY apps/api/src ./src
COPY sql /sql
ENV MIGRATIONS_DIR=/sql/migrations

# Expose port
EXPOSE 8080

# Start the application
CMD ["node", "src/index.js"]
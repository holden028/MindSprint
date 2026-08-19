FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY apps/web/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY apps/web ./

# Build the application
RUN npm run build

# Install serve to run the built app
RUN npm install -g serve

# Expose port
EXPOSE 5174

# Start the application
CMD ["serve", "-s", "dist", "-l", "5174"]
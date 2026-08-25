FROM node:18-alpine

WORKDIR /app

COPY apps/web/package*.json ./
RUN npm install

COPY apps/web ./

# Baked in at build time (e.g. https://mindsprint.duckdns.org/api)
ARG VITE_API_URL=http://localhost:8080
ARG VITE_BUILD_SHA=unknown
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BUILD_SHA=$VITE_BUILD_SHA
RUN npm run build

EXPOSE 5174
CMD ["npx", "serve", "-s", "dist", "-l", "5174"]

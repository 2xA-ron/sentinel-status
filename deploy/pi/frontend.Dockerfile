# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Vite bakes VITE_* vars into the client bundle at build time — they must be build
# args here, not container-runtime env vars (those only affect the Node server
# process, not the already-built browser JS).
ARG VITE_API_BASE_URL=http://localhost:8080
ARG VITE_SSR_API_BASE_URL=http://nginx:8080
ARG VITE_USE_RELATIVE_API=true
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_SSR_API_BASE_URL=${VITE_SSR_API_BASE_URL}
ENV VITE_USE_RELATIVE_API=${VITE_USE_RELATIVE_API}

# Build the app for Node.js server (not Cloudflare)
RUN npm run build:pi

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built assets from builder
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Expose port
EXPOSE 3000

# Start the app
CMD ["node", ".output/server/index.mjs"]

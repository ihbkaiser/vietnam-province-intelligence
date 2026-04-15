# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
# Truyền build args cho Vite
ARG VITE_OPENMAP_API_KEY
ENV VITE_OPENMAP_API_KEY=$VITE_OPENMAP_API_KEY
RUN npm run build

# Stage 2: Build + run backend
FROM node:20-alpine
WORKDIR /app

COPY backend/package*.json ./
RUN npm install --legacy-peer-deps

COPY backend/ ./
RUN npm run build

# Copy frontend build vào backend để serve static
COPY --from=frontend-build /app/frontend/dist ./public

EXPOSE 8787
CMD ["node", "dist/server.js"]

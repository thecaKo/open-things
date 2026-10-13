FROM node:24-slim AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:24-slim
WORKDIR /app
COPY server/ ./server/
COPY tools/ ./tools/
COPY --from=web /app/web/dist ./web/dist
ENV DATA_DIR=/data STATIC_DIR=/app/web/dist PORT=8080 NODE_ENV=production
VOLUME /data
EXPOSE 8080
CMD ["node", "server/src/index.ts"]

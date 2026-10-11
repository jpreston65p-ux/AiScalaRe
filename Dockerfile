FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
COPY scripts ./scripts
COPY catalogo.json ./catalogo.json
RUN mkdir -p /app/data && chown node:node /app/data && chmod 700 /app/data
USER node
ENV SCALA_DATA_DIR=/app/data
CMD ["node", "--max-old-space-size=256", "src/index.mjs", "--servicio"]

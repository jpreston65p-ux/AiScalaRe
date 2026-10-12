FROM node:24-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright NODE_ENV=production SCALA_FACEBOOK_DATA_DIR=/app/data SCALA_FACEBOOK_HEADLESS=1 SCALA_FACEBOOK_BROWSER=firefox
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npx --no-install playwright install --with-deps firefox
COPY src/ ./src/
COPY catalogo.json facebook.config.json ./
COPY scripts/nube.sh ./scripts/nube.sh
RUN chmod 750 /app/scripts/nube.sh && mkdir -p /app/data && chown node:node /app/data
CMD ["/app/scripts/nube.sh"]

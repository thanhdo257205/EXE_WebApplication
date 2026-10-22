FROM node:24.15.0-bookworm-slim
WORKDIR /home/node/app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && chown -R node:node /home/node/app
COPY --chown=node:node server/src ./src
COPY --chown=node:node server/schema.sql ./schema.sql
USER node
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=256"
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/index.ts"]

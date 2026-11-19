FROM node:20-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/apps/reports-service
COPY apps/reports-service/package*.json ./
RUN npm ci
COPY tsconfig.base.json /app/tsconfig.base.json
COPY apps/reports-service/ ./
RUN npm run prisma:generate && npm run build

FROM build AS migration
USER node
CMD ["node", "scripts/migrate-deploy.mjs"]

FROM build AS production-dependencies
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app/apps/reports-service
COPY --from=production-dependencies --chown=node:node /app/apps/reports-service/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/reports-service/dist ./dist
USER node
EXPOSE 3011
HEALTHCHECK --interval=10s --timeout=5s --retries=12 CMD node -e "fetch('http://127.0.0.1:3011/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]

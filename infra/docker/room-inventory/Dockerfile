# Room Inventory Service (Sprint 4). Multi-stage; non-root runtime compatible with a read-only filesystem.
FROM node:20-bookworm-slim AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/room-inventory-service/package.json apps/room-inventory-service/package.json
RUN npm ci --workspace @stayhub/room-inventory-service --include-workspace-root

FROM dependencies AS build
COPY tsconfig.base.json nest-cli.json ./
COPY apps/room-inventory-service apps/room-inventory-service
RUN npm run prisma:inventory:generate && npm run build:inventory

# One-shot job: `prisma migrate deploy` against inventory_db only.
FROM dependencies AS migration
COPY apps/room-inventory-service/prisma apps/room-inventory-service/prisma
COPY apps/room-inventory-service/scripts apps/room-inventory-service/scripts
CMD ["npm", "run", "prisma:inventory:migrate:deploy"]

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl tini \
  && rm -rf /var/lib/apt/lists/*
COPY --from=dependencies /workspace/node_modules ./node_modules
COPY --from=build /workspace/dist/apps/room-inventory-service ./dist
USER node
EXPOSE 3008
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3008/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]

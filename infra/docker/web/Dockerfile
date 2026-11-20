FROM node:20-bookworm-slim AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace @stayhub/web --include-workspace-root --no-audit --no-fund
COPY apps/web apps/web
ENV VITE_API_BASE_URL=/api/v1
RUN npm run build:web

FROM nginx:stable-alpine
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
COPY infra/docker/web/default.conf /etc/nginx/conf.d/default.conf

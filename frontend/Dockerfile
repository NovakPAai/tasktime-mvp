FROM node:20-bookworm-slim AS build

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci --legacy-peer-deps

COPY frontend/tsconfig.json ./
COPY frontend/vite.config.ts ./
COPY frontend/index.html ./
COPY frontend/src ./src
COPY frontend/scripts ./scripts

RUN npm run build

FROM nginx:1.27-alpine AS runtime

# nginx:1.27-alpine auto-runs envsubst on /etc/nginx/templates/*.template at startup
COPY deploy/nginx/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

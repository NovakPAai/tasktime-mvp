FROM node:20-bookworm-slim AS build

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci --legacy-peer-deps

COPY frontend/tsconfig.json ./
COPY frontend/vite.config.ts ./
COPY frontend/index.html ./
COPY frontend/src ./src
COPY frontend/scripts ./scripts

# TTSRH-1 cutover: VITE_* env vars are baked into the bundle at `vite build`
# time. They must be present as ENV (not just ARG) during `npm run build`.
# Default is `false` (safe) — CI passes --build-arg to opt in; a local
# `docker build` without the arg keeps the feature off.
ARG VITE_FEATURES_ADVANCED_SEARCH=false
ENV VITE_FEATURES_ADVANCED_SEARCH=$VITE_FEATURES_ADVANCED_SEARCH

RUN npm run build

FROM nginx:1.27-alpine AS runtime

# nginx:1.27-alpine auto-runs envsubst on /etc/nginx/templates/*.template at startup
COPY deploy/nginx/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

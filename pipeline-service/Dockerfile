FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY pipeline-service/package*.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY pipeline-service/package*.json ./
RUN npm ci
COPY pipeline-service/tsconfig.json ./
COPY pipeline-service/src ./src
RUN npx prisma generate
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown

ENV NODE_ENV=production
ENV PORT=3100
ENV GIT_SHA=${GIT_SHA}
ENV BUILD_TIME=${BUILD_TIME}

COPY pipeline-service/package*.json ./
COPY pipeline-service/src/prisma ./src/prisma
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

RUN npx prisma generate

EXPOSE 3100
CMD ["node", "dist/server.js"]

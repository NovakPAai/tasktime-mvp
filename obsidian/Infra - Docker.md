---
tags: [infra, docker, devops]
---

# Infra — Docker

`docker-compose.yml` — два сервиса:

## Services

```yaml
postgres:
  image: postgres:16
  port: 5432
  env: POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD

redis:
  image: redis:7
  port: 6379
```

## Dev запуск

```bash
make dev
# Запускает: postgres + redis (docker) + backend (:3000) + frontend (:5173)
```

## Prod деплой

`deploy/scripts/deploy.sh` — деплой на сервер
`deploy/scripts/rollback.sh` — откат
`deploy/nginx/` — reverse proxy, rate limiting

## Связи

- [[Infra - PostgreSQL]] — PostgreSQL в Docker
- [[Redis Cache]] — Redis в Docker
- [[Dev Workflow]] — команды запуска

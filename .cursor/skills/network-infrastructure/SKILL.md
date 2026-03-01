---
name: network-infrastructure
description: Network and infrastructure specialist: networks, servers, cloud, deployment, availability. Use when designing or operating infrastructure, deployment, or network topology.
---

# Специалист по сети и инфраструктуре

## Зона ответственности

- Сети: топология, сегментация, файрволы, DNS; доступность и мониторинг.
- Инфраструктура: серверы, ВМ, облако (в т.ч. российские провайдеры при необходимости); деплой, резервирование, бэкапы.
- Для TaskTime: деплой на Ubuntu/VPS (см. [deploy-tasktime](../deploy-tasktime/SKILL.md)) — частный кейс этой роли.

## Обязательный контекст

Учитывать контекст импортозамещения: [ru-compliance-context](../ru-compliance-context/SKILL.md). система не ЗоКИИ; структура требований по импортозамещению; допущения и легальные варианты использования иностранного ПО и оборудования (ОС, СУБД, облако). Не предполагать по умолчанию полное импортозамещение или режим КИИ; при выборе иностранных решений — фиксировать допущение или рекомендовать согласование.

## Выход

Схемы, конфигурации, runbook; при необходимости — допущения по импортозамещению и ссылка на комплаенс.

---

## CI/CD: GitHub Actions + SSH-deploy

### Паттерн для TaskTime

Push в `main` → GitHub Actions → SSH на сервер → `bash /home/tasktime/deploy.sh`

**Action:** `appleboy/ssh-action@v1.2.0` — стандартный способ запустить скрипт на VPS без агента.

Шаблон workflow (`.github/workflows/deploy.yml`):
```yaml
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: tasktime
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          port: 22
          script: bash /home/tasktime/deploy.sh
          script_stop: true
```

### Требования к инфраструктуре

1. **SSH-ключ без пассфразы** — приватный ключ в GitHub Secret `DEPLOY_SSH_KEY`, публичный в `~/.ssh/authorized_keys` на сервере.
2. **Sudoers** — пользователь деплоя (`tasktime`) должен перезапускать сервис без пароля:
   ```
   tasktime ALL=(ALL) NOPASSWD: /bin/systemctl restart tasktime
   ```
3. **deploy.sh на сервере** — скрипт с логикой pull → install → restart → проверка → откат. Лог: `/var/log/tasktime-deploy.log`.

### Безопасность CI/CD

- Ключ деплоя — отдельный SSH-ключ только для деплоя, не личный ключ разработчика.
- Sudoers ограничен конкретной командой (`/bin/systemctl restart tasktime`), а не `ALL`.
- Секреты хранятся только в GitHub Secrets, не в коде и не в `.env` в репо.

Полная инструкция по настройке: [deploy-tasktime](../deploy-tasktime/SKILL.md).

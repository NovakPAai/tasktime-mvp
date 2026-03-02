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

---

## Диагностика доступности сайта из интернета

### Симптом: «открывается пустая страница»

Прежде чем лезть на сервер — проверить HTTP-ответ снаружи:

```bash
# Статус и тело ответа
curl -s -o /dev/null -w "%{http_code}" http://IP/
curl -s http://IP/ | head -c 1000
```

Если HTTP 200 и HTML приходит — проблема **в браузере**, не в сервере. Типичные причины:

| Причина | Признак | Решение |
|---|---|---|
| **Render-blocking ресурс заблокирован** (Google Fonts, CDN) | `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` | Сделать загрузку неблокирующей (см. ниже) |
| JS-ошибка до рендера | Белый экран, в консоли ошибка | Открыть DevTools → Console |
| Сервис упал | curl возвращает 502/503 или timeout | `ssh` → `systemctl status tasktime` |

### Паттерн: неблокирующая загрузка шрифтов / внешних CSS

Google Fonts и другие внешние CSS **заблокированы в России** (с 2022). Обычный `<link rel="stylesheet">` — **рендер-блокирующий**: браузер белый экран, пока ресурс не загрузится или не истечёт timeout.

**Плохо:**
```html
<link href="https://fonts.googleapis.com/css2?..." rel="stylesheet">
```

**Хорошо — неблокирующая загрузка с системным fallback:**
```html
<link href="https://fonts.googleapis.com/css2?..." rel="stylesheet"
      media="print" onload="this.media='all'">
<noscript><link href="https://fonts.googleapis.com/css2?..." rel="stylesheet"></noscript>
```

Принцип: `media="print"` исключает ресурс из критического пути рендера; `onload` переключает на `all` после загрузки. Страница рисуется сразу с системными шрифтами-fallback.

**CSS должен иметь fallback-стек:**
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
```

Это правило применимо к **любым** внешним CSS/шрифтам (Google Fonts, Adobe Fonts, любые CDN), доступность которых из России не гарантирована.

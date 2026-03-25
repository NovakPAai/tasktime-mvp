# Telegram Integration

> Status: Planned (Sprint 4+)
> Last updated: 2026-03-25

---

## Planned functionality

Telegram bot will send notifications to team members about:
- Issue status changes (assigned to you)
- Sprint start/close events
- @mentions in comments
- High-priority issue creation

---

## Architecture (planned)

```
Flow Universe Backend
    ↓ (on mutation)
Notification service
    ↓
Telegram Bot API (sendMessage)
    ↓
User's Telegram
```

---

## Setup (when implemented)

Will require:
1. Create Telegram bot via @BotFather → get `BOT_TOKEN`
2. Add to `backend/.env`: `TELEGRAM_BOT_TOKEN=...`
3. Enable feature flag: `FEATURE_TELEGRAM=true`
4. Each user links their Telegram account in profile settings (via `/start` command to bot)

---

## Update this doc

When Telegram integration is implemented, update this file with:
- Actual API endpoints (`POST /api/telegram/...`)
- User linking flow
- List of notification events and their payloads
- Troubleshooting section

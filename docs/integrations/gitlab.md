# GitLab Integration

> Full step-by-step setup: [GITLAB_WEBHOOK.md](./GITLAB_WEBHOOK.md)
> Last updated: 2026-03-25

---

## What it does

When GitLab repository events mention a Flow Universe issue key (e.g. `TTMP-83`), the issue status is updated automatically:

| GitLab event | Issue status change |
|-------------|---------------------|
| Push to branch with issue key in name | `IN_PROGRESS` |
| Merge request opened | `REVIEW` |
| Merge request merged | `DONE` |

---

## How it works

```
Developer pushes branch "feature/TTMP-83-login"
    ↓
GitLab sends POST to /api/webhooks/gitlab
    ↓
Flow Universe extracts issue key "TTMP-83" from branch name
    ↓
Finds issue by key: GET /api/issues/key/TTMP-83
    ↓
Updates status to IN_PROGRESS
    ↓
Logs to audit_log
```

---

## Setup (3 steps)

### 1. Set webhook secret

In `backend/.env` (or deployment env file):
```bash
GITLAB_WEBHOOK_SECRET=your-random-secret-here
```

Generate a secret: `openssl rand -hex 32`

### 2. Configure GitLab webhook

1. GitLab → Your project → Settings → Webhooks
2. URL: `https://<your-backend>/api/webhooks/gitlab`
3. Secret Token: same value as `GITLAB_WEBHOOK_SECRET`
4. Events to enable:
   - ✓ Push events
   - ✓ Merge request events
5. Save

### 3. Test

Push a branch with an issue key in the name:
```bash
git checkout -b feature/TTMP-1-test-webhook
git push origin feature/TTMP-1-test-webhook
```

Check that issue `TTMP-1` status changed to `IN_PROGRESS`.

---

## Issue key format in branch names

The webhook extracts issue keys using pattern `[A-Z]+-\d+`:
- `feature/TTMP-83-login-bug` → `TTMP-83`
- `fix/DEMO-42` → `DEMO-42`
- `BACK-103-refactor` → `BACK-103`

---

## Troubleshooting

**Webhook not triggering:**
- Check `GITLAB_WEBHOOK_SECRET` matches the value in GitLab
- Backend must be reachable from GitLab (not localhost)
- Use ngrok for local testing: `ngrok http 3000`

**Status not changing:**
- Verify issue key format: must be `PROJECT_KEY-NUMBER` (uppercase, dash, digits)
- Check issue exists: `GET /api/issues/key/TTMP-83`
- Check audit_log for webhook actions

**Detailed setup:** [GITLAB_WEBHOOK.md](./GITLAB_WEBHOOK.md)

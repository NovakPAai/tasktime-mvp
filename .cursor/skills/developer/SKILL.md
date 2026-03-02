---
name: developer
description: Developer role: implementation, code quality, APIs, backend/frontend. Use when implementing features, refactoring, or making technology choices.
---

# Разработчик

## Зона ответственности

- Реализация требований: код, API, интеграции, тесты (unit/integration по месту).
- Качество кода, соглашения проекта, безопасность на уровне реализации (запросы, данные, зависимости).
- Выбор библиотек и стеков — с учётом контекста импортозамещения (см. ниже).

## Обязательный контекст

Учитывать контекст импортозамещения: [ru-compliance-context](../ru-compliance-context/SKILL.md). система не ЗоКИИ; структура требований по импортозамещению; допущения и легальные варианты использования иностранного ПО. При выборе иностранных компонентов — явно фиксировать допущение или рекомендовать согласование с комплаенсом.

## Выход

Код, коммиты, краткое описание решений и при необходимости — список допущений по компонентам.

---

## Паттерны и грабли: auth в SPA

### Правило: серверный cookie-gate на статике — антипаттерн

**Не делать:**
```js
// ❌ Неправильно — ломается в Safari, Chrome с ITP
app.get('/app', (req, res) => {
  const token = req.cookies?.tasktime_token;
  if (!token) return res.redirect('/?blocked=1');
  jwt.verify(token, SECRET);
  res.sendFile('app.html');
});
```

**Делать:**
```js
// ✅ Правильно — SPA-паттерн
app.get('/app', (req, res) => {
  res.sendFile('app.html');  // HTML отдаём всегда
});
// Защита — только на API-эндпоинтах:
app.get('/api/tasks', authMiddleware, ...);
```

**Почему:** браузеры (особенно Safari/ITP) могут не включить HttpOnly-куку, установленную через `fetch()`, в следующий навигационный запрос (`window.location.href`). Сервер не видит куку → редиректит → пользователь видит заглушку несмотря на успешный логин.

**Auth на клиенте (правильная схема):**
```
localStorage.getItem(token)
  → есть → showApp()
  → нет  → fetch('/api/auth/me', { credentials: 'include' })
              → 200 → showApp()
              → 401 → redirect('/?blocked=1')
```

### Куки: обязательные флаги

| Флаг | Значение | Комментарий |
|---|---|---|
| `httpOnly: true` | Недоступна из JS | Защита от XSS |
| `sameSite: 'Strict'` | Только same-site запросы | Подходит для обычного web-app |
| `secure: process.env.NODE_ENV === 'production'` | Только HTTPS | Не ставить `true` без HTTPS — кука тихо выбросится |
| `path: '/'` | Весь сайт | Обязательно, иначе кука не придёт на `/api` |

> Если `secure: true` и нет HTTPS — браузер тихо выбросит куку, авторизация сломается без явных ошибок.

### Редиректы после логина

При использовании `window.location.href` после `fetch()`:
- `SameSite=Strict` кука **должна** прийти при same-site навигации — но не всегда приходит в реальных браузерах
- Безопаснее полагаться на `localStorage` токен + `/api/auth/me` как fallback, а не на куку при навигации
- Никогда не делать логику «если кука есть — значит авторизован» на уровне раздачи статики

---

## Паттерны: vanilla JS SPA без фреймворка

### Навигация: pageMap + явный вызов загрузчика

Типичная грабля — добавить nav-ссылку в HTML, но забыть прописать страницу в `pageMap` и/или не добавить вызов загрузчика данных.

**Правильная схема:**
```javascript
// 1. Все страницы в одном месте
const pageMap = {
  main: 'pageMain', tasks: 'pageTasks', users: 'pageUsers', /* ... */
};

// 2. Единый обработчик навигации
btn.addEventListener('click', function() {
  const page = this.dataset.page;
  // активировать страницу
  const el = document.getElementById(pageMap[page]);
  if (el) el.classList.add('active');
  // загрузить данные для страницы
  if (page === 'users')    loadUsersPage();
  if (page === 'projects') loadProjectsPage();
  // ...
});
```

**Чеклист при добавлении новой страницы:**
- [ ] `data-page="..."` на nav-кнопке
- [ ] `id="page..."` на секции
- [ ] запись в `pageMap`
- [ ] вызов `load...Page()` в nav-обработчике
- [ ] показ/скрытие nav-кнопки по роли в `showApp()`

### Видимость элементов по роли

Элементы скрытые по умолчанию (`display:none`) нужно **явно показывать** в `showApp()` по роли:

```javascript
function showApp() {
  if (currentUser.role === 'admin') {
    document.querySelectorAll('.sidebar-admin-link').forEach(el => el.style.display = 'flex');
    document.querySelectorAll('.sidebar-audit-link').forEach(el => el.style.display = 'flex');
  }
  if (currentUser.role === 'viewer') {
    document.querySelectorAll('.task-create-btn').forEach(el => el.style.display = 'none');
  }
}
```

Если забыть — ссылка в HTML есть, но пользователь её не видит, и кажется что функция «сломана».

### Мобильная навигация: slide-in sidebar + overlay

```css
@media (max-width: 900px) {
  .sidebar {
    display: flex !important;  /* не скрывать, а прятать за экран */
    position: fixed;
    transform: translateX(-100%);
    transition: transform .22s ease;
    z-index: 50;
  }
  .sidebar.open { transform: translateX(0); }
  .sidebar-overlay.visible { display: block; }
}
```

```javascript
// Hamburger открывает
document.getElementById('hamburgerBtn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('visible');
});
// Overlay закрывает
document.getElementById('sidebarOverlay').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
});
// Закрывать при выборе пункта меню
document.querySelectorAll('.sidebar-nav-link').forEach(btn =>
  btn.addEventListener('click', () => {
    if (window.innerWidth <= 900) {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebarOverlay').classList.remove('visible');
    }
  })
);
```

### Impersonation через localStorage

Паттерн «посмотреть как другой пользователь» без серверного session store:

```javascript
// Сохранить оригинальный токен и переключиться
async function impersonate(userId) {
  const res = await apiFetch('/api/auth/impersonate', {
    method: 'POST', body: JSON.stringify({ user_id: userId })
  });
  localStorage.setItem('orig_token', localStorage.getItem('token'));
  localStorage.setItem('orig_user',  localStorage.getItem('user'));
  localStorage.setItem('token', res.token);
  localStorage.setItem('user',  JSON.stringify(res.user));
  window.location.reload();
}

// Восстановить
function exitImpersonation() {
  localStorage.setItem('token', localStorage.getItem('orig_token'));
  localStorage.setItem('user',  localStorage.getItem('orig_user'));
  localStorage.removeItem('orig_token');
  localStorage.removeItem('orig_user');
  window.location.reload();
}

// При загрузке: проверить флаг и показать баннер
const isImpersonating = !!localStorage.getItem('orig_token');
if (isImpersonating) showImpersonationBanner(currentUser);
```

Требования к backend: отдельный endpoint `POST /api/auth/impersonate` (только для `admin`), возвращает JWT с ролью целевого пользователя. Токен с укороченным TTL (например 2h).

---

## Паттерны: Admin Panel (отдельная SPA-страница)

### Отдельный HTML для adminpanel — правильнее, чем секция в app.html

Когда приложение уже большое (>1500 строк), добавление новой функциональности в тот же файл ухудшает поддержку. Для инструментов с другой аудиторией (администраторы vs пользователи) — делать отдельную страницу:

```
/app    → frontend/app.html  (пользователи)
/admin  → frontend/admin.html (только admin/super-admin)
```

Защита строго на двух уровнях:
1. **Сервер**: `adminMiddleware` на каждом `/api/admin/*` — 403 для не-admin
2. **Клиент**: `init()` в admin.html — `/api/auth/me` → проверка роли → если не admin → показать заглушку или редирект

**Никогда не делать cookie-gate на раздаче admin.html!** — та же грабля что с `/app`.

### adminMiddleware — паттерн для RBAC-группы ролей

```javascript
function adminMiddleware(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.role !== 'admin' && req.user.role !== 'super-admin') {
    return res.status(403).json({ error: 'Forbidden: admin role required' });
  }
  next();
}

// Использование: два middleware подряд
app.get('/api/admin/stats', authMiddleware, adminMiddleware, handler);
```

### super-admin vs admin: паттерн иерархии ролей

| Может | admin | super-admin |
|---|---|---|
| Доступ к /admin | ✓ | ✓ |
| Управлять user/manager/cio/viewer | ✓ | ✓ |
| Управлять другими admin | ✗ | ✓ |
| Назначать super-admin | ✗ | ✓ |

```javascript
// Проверка в PATCH /api/admin/users/:id
if ((target.role === 'admin' || target.role === 'super-admin') && req.user.role !== 'super-admin') {
  return res.status(403).json({ error: 'Only super-admin can manage admin accounts' });
}
if (role === 'super-admin' && req.user.role !== 'super-admin') {
  return res.status(403).json({ error: 'Only super-admin can assign super-admin role' });
}
// Нельзя менять самого себя
if (targetId === req.user.id) return res.status(400).json({ error: 'Cannot modify your own account' });
```

### Graceful DB migration: ADD COLUMN IF NOT EXISTS

Паттерн для добавления колонки без даунтайма — колонка добавляется и в schema.sql, и сразу применяется через `ALTER TABLE IF NOT EXISTS`:

```sql
-- В schema.sql: сначала основная таблица, потом migration-строка
CREATE TABLE IF NOT EXISTS users ( id SERIAL ... );
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE;
```

Запрос в коде делать graceful-fallback, если колонка ещё не создана:

```javascript
try {
  result = await query('SELECT id, is_blocked FROM users WHERE id = $1', [id]);
} catch (_) {
  result = await query('SELECT id, FALSE AS is_blocked FROM users WHERE id = $1', [id]);
}
```

### Системные метрики через Node.js built-ins (без внешних зависимостей)

```javascript
const os = require('os');
// process.uptime() — аптайм Node-процесса в секундах
// os.uptime()      — аптайм ОС в секундах
// process.memoryUsage() — { rss, heapUsed, heapTotal, external }
// os.cpus().length — число ядер
// os.loadavg()     — [1min, 5min, 15min] load average
// os.totalmem() / os.freemem() — память в байтах
```

### Чтение deploy-лога: graceful если файл отсутствует

```javascript
const DEPLOY_LOG = process.env.DEPLOY_LOG_PATH || '/var/log/tasktime-deploy.log';
app.get('/api/admin/deploys', adminMiddleware, async (req, res) => {
  try {
    if (!fs.existsSync(DEPLOY_LOG)) return res.json([]);
    const raw = fs.readFileSync(DEPLOY_LOG, 'utf8');
    res.json(parseDeployLog(raw.split('\n').filter(Boolean)));
  } catch (_) {
    res.json([]);  // никогда не падаем с 500 из-за лога
  }
});
```

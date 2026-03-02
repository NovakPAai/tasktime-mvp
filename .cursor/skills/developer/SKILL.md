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

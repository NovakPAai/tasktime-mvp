# ТЗ: TTBRAND-1 — Look & Feel (брендинг)

**Дата:** 2026-04-23
**Тип:** TASK | **Приоритет:** P2 | **Статус:** OPEN
**Проект:** TaskTime MVP (TTMP)
**Исполнитель:** TBD
**Автор ТЗ:** Claude Code (auto-generated)

---

## 1. Постановка задачи

Возможность кастомизации брендинга для корпоративного заказчика: логотип, favicon, заголовок приложения, primary-color, текст на логин-странице, текст футера, логотип в email-шаблонах.

**Storage переиспользует TTATTACH-1** — логотип/favicon/email-logo хранятся через `StorageProvider` (local/s3).

**Темы (light/dark)** уже реализованы — в этом ТЗ **не трогаем**.

### Пользовательские сценарии

**Админ кастомизирует продукт:**
1. `/admin/branding` → upload логотипа (PNG 400×80).
2. Primary color → `#0066cc`.
3. App title → «CorpTasks».
4. Footer text → «© 2026 ОАО Ромашка. Только для внутреннего использования».
5. Save → весь UI обновляется, email-шаблоны тоже.

---

## 2. Текущее состояние

- Логотип и favicon — встроены в frontend bundle, кастомизация невозможна без rebuild'а.
- Primary color — hard-coded через AntDesign default theme.
- App title — `<title>TaskTime MVP</title>` в index.html.
- Email-шаблоны (после TTNOTIF-1) — без логотипа.

---

## 3. Зависимости

### Модули backend
- [ ] `modules/admin/branding.router.ts` — GET/PATCH настроек.
- [ ] `modules/admin/branding.service.ts` — lookup + upload delegation.

### Frontend
- [ ] `pages/admin/AdminBrandingPage.tsx` — форма настроек + upload.
- [ ] `components/layout/Logo.tsx` — читает из settings.
- [ ] `App.tsx` — в useEffect обновить `document.title` + favicon + CSS-vars для primary color.
- [ ] `pages/LoginPage.tsx` — блок с loginPageText.

### Модели данных (Prisma)
- [ ] `SystemSetting` ключи: `branding.*`.

### Внешние зависимости
- Нет новых. Переиспользует storage из TTATTACH-1.

### Блокеры
- **TTATTACH-1 обязателен** (storage abstraction + upload API).

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | Огромный логотип (5MB PNG) замедляет загрузку страницы | Средняя | UX | Validation на upload: max 500KB для brand-assets; server-side resize через sharp (аналог thumbnail) |
| 2 | Primary color = ярко-жёлтый → нечитабельно | Низкая | Brand-fail | Preview в настройках + contrast-checker (WCAG AA) с warning |
| 3 | Старый логотип закэширован у пользователей | Средняя | UX | Storage-key в URL меняется на каждый upload (timestamp в filename); cache-busting автоматический |
| 4 | SVG логотип содержит XSS (embedded script) | Средняя | Compromise | SVG-sanitizer при upload (удаляет `<script>`, `on*` handlers); или просто отказ от SVG — только PNG/JPG |

---

## 5. Особенности реализации

### 5.1 Settings keys

```
branding.logoStorageKey        String    — ссылка на attachment storage key
branding.logoThumbUrl          String    — cached signed URL (TTL 24h)
branding.faviconStorageKey     String
branding.emailLogoStorageKey   String    — отдельный логотип для email (может быть light-версия)
branding.appTitle              String    — "TaskTime", "CorpTasks"
branding.primaryColor          String    — hex #0066cc
branding.loginPageText         String?   — markdown (минимум), ~500 chars
branding.footerText            String?   — ~200 chars
```

### 5.2 Upload через TTATTACH-1

Специальный endpoint:

```
POST /admin/branding/:assetType/upload   (assetType: logo | favicon | emailLogo)
  multipart file
  → reuse TTATTACH-1 upload logic with:
    - fixed storage path `/branding/:assetType/...`
    - stricter MIME whitelist: image/png, image/jpeg, image/x-icon (только favicon)
    - max size 500KB
    - server-side resize для logo (max 600×120), emailLogo (400×80)
  → возвращает { storageKey }
  → backend обновляет SystemSetting[branding.{assetType}StorageKey]
```

### 5.3 Public API

```
GET /api/branding   (unauthenticated — нужно до login'а для кастомного login-page)
  → {
    appTitle: "CorpTasks",
    primaryColor: "#0066cc",
    logoUrl: "/api/branding/assets/logo?v=1714...",
    faviconUrl: "/api/branding/assets/favicon?v=1714...",
    loginPageText: "...",
    footerText: "..."
  }
```

`logoUrl` — динамический endpoint, проксирует из storage с правильным cache-control:

```
GET /api/branding/assets/:assetType  (public, unauthenticated)
  → reads branding.{assetType}StorageKey
  → stream from storage with Cache-Control: public, max-age=3600
```

Secret-check не нужен — логотип публичный по определению.

### 5.4 Frontend runtime injection

```typescript
// App.tsx
useEffect(() => {
  const loadBranding = async () => {
    const b = await fetch('/api/branding').then(r => r.json());
    document.title = b.appTitle;
    // primary color через CSS custom property
    document.documentElement.style.setProperty('--primary-color', b.primaryColor);
    // favicon
    const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
    if (link) link.href = b.faviconUrl;
    // AntDesign theme override
    ConfigProvider.config({ theme: { token: { colorPrimary: b.primaryColor } } });
  };
  void loadBranding();
}, []);
```

Первоначальная загрузка — показывает defaults (TT-brand), через ~100ms подменяется на кастом. Это допустимый trade-off (альтернатива — SSR, overkill).

### 5.5 Email templates (TTNOTIF-1)

Handlebars-шаблоны получают доступ к `brandingLogoUrl`:

```handlebars
<table>
  <tr><td align="center">
    <img src="{{brandingLogoUrl}}" alt="{{brandingAppTitle}}" style="max-height: 60px" />
  </td></tr>
</table>
```

Notifications-service при render email делает `GET /api/branding` (с internal auth) и прокидывает в context.

### 5.6 Admin UI — AdminBrandingPage

Секции:
1. **Логотип** — preview (current) + drop-zone upload + «Удалить».
2. **Favicon** — preview + upload.
3. **Email-логотип** — preview + upload.
4. **Заголовок** — Input.
5. **Primary color** — ColorPicker (AntDesign) + contrast-checker.
6. **Текст на логин-экране** — textarea (markdown).
7. **Футер** — textarea.
8. **Preview** — iframe с рендером кастомного login-page (для проверки).

Save-кнопка → 1 PATCH на все поля сразу (оптимистичный apply + rollback при error).

### 5.7 Default fallback

Если `branding.*` keys не заданы — используются defaults:
- appTitle = `TaskTime MVP`.
- primaryColor = `#1677ff` (AntDesign default blue).
- logoUrl = `/static/tt-logo.svg` (в bundle).
- faviconUrl = `/favicon.ico`.
- loginPageText = null (не показывается).
- footerText = null.

---

## 6. Требования к реализации

### Функциональные
- [ ] FR-1: Admin загружает логотип/favicon/emailLogo через UI.
- [ ] FR-2: Server-side resize для размеров 600×120 / 64×64 / 400×80.
- [ ] FR-3: SVG запрещён (только PNG/JPG/ICO для favicon).
- [ ] FR-4: Settings сохраняются в `SystemSetting`.
- [ ] FR-5: `/api/branding` public endpoint.
- [ ] FR-6: Frontend на старте подгружает branding и применяет.
- [ ] FR-7: Primary color доступен через `var(--primary-color)` и AntDesign theme.
- [ ] FR-8: Email-шаблоны используют `brandingLogoUrl`.
- [ ] FR-9: Contrast-checker в UI warning.
- [ ] FR-10: Cache-busting при смене (query-параметр ver).

### Нефункциональные
- [ ] NFR-1: `/api/branding` cache на CDN-layer (если появится) — cacheable 1 hour с revalidation.
- [ ] NFR-2: Branding apply < 200ms после fetch.

### Безопасность
- [ ] SEC-1: Upload — только SUPER_ADMIN.
- [ ] SEC-2: MIME/size validation на server-side.
- [ ] SEC-3: Primary color валидируется как валидный hex (regex).
- [ ] SEC-4: loginPageText markdown — sanitize (escape HTML, whitelist Markdown).

### Тестирование
- [ ] Unit: hex validation, sanitize logic.
- [ ] Integration: upload → settings updated → `/api/branding` returns correctly.
- [ ] E2E: сменить primary color → UI обновился без перезагрузки.
- [ ] Покрытие ≥ 60%.

---

## 7. Критерии приёмки

- [ ] AC-1: Upload 300KB PNG → логотип виден в шапке.
- [ ] AC-2: Upload 2MB → 413.
- [ ] AC-3: Upload SVG → 400 MIME_NOT_ALLOWED.
- [ ] AC-4: Изменение primary-color → вся UI с новым цветом без refresh.
- [ ] AC-5: Email после TTNOTIF-1 содержит custom-logo.
- [ ] AC-6: Login-page показывает кастомный текст.
- [ ] AC-7: Footer в подвале виден.
- [ ] AC-8: Tests зелёные.

---

## 8. Оценка трудоёмкости

| Этап | Часы |
|------|------|
| Backend: branding.service (integrate storage) + resize | 4 |
| Backend: /api/branding public + /branding/assets/:type | 3 |
| Admin upload router (delegate to TTATTACH-1) | 3 |
| Frontend: AdminBrandingPage + ColorPicker + preview | 8 |
| Frontend: App.tsx runtime injection | 3 |
| Frontend: LoginPage customization + footer | 3 |
| Email template integration | 2 |
| Tests | 4 |
| Code review | 2 |
| **Итого** | **32** (~0.5 спринта) |

---

## 9. Связанные задачи

- **Зависит от:** TTATTACH-1.
- **Связано:** TTNOTIF-1 (email templates).

---

## 10. Иерархия задач

```
TTBRAND-1 (TASK) — Look & Feel
  ├─ TTBRAND-1.1 — Backend branding service + public API
  ├─ TTBRAND-1.2 — Admin UI + ColorPicker + preview
  ├─ TTBRAND-1.3 — Runtime frontend injection
  ├─ TTBRAND-1.4 — Email template integration
  └─ TTBRAND-1.5 — Tests
```

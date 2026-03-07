# TaskTime Frontend

Current state: static HTML pages (`index.html`, `app.html`, `admin.html`) with inline and shared styles/scripts.

Target structure and UI architecture are described in **docs/ENG/architecture/FRONTEND_UI_ARCHITECTURE.md**. Use that document for:

- Global layout (sidebar, topbar, main workspace)
- Page structure and routes
- Design system and components
- API mapping (no backend changes)
- Implementation guidance

## Design tokens

- **frontend/styles/tokens.css** — CSS variables for colors, spacing, typography. Can be linked from existing HTML or from a future SPA build.

## Target folder structure (for future SPA)

When migrating to a bundled SPA (e.g. Vite + React), use the structure below. Until then, existing `app.html` remains the main app entry.

```
frontend/
  index.html, app.html, admin.html   # Current entries
  styles/
    tokens.css                       # Design tokens (use from any entry)
  src/                               # Optional: SPA source
    app/       layout, pages, routes
    components/ ui, issues, boards, projects
    features/   issues, projects, boards, search
    hooks/
    services/   api, endpoints
    types/
```

## API

All data comes from the existing backend. See **docs/ENG/API.md**. Auth: SPA pattern (HTML always served; protect only API; client checks `/api/auth/me` and redirects on 401).

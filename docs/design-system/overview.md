# Design System Overview

> Last updated: 2026-03-25
> Source: `frontend/src/App.tsx` (theme config), `frontend/src/lib/`

---

## Visual direction

**Dark mode** as primary. Minimal, high-contrast, editorial. Inter font family.

---

## Ant Design theme

Flow Universe uses Ant Design 5 with `darkAlgorithm` and a custom token override:

```typescript
// frontend/src/App.tsx
{
  algorithm: antdTheme.darkAlgorithm,
  token: {
    colorPrimary: 'var(--acc)',      // accent color
    colorBgBase: 'var(--bg)',        // background
    colorBgContainer: 'var(--bg)',
    colorBorder: 'var(--b2)',        // secondary border
    colorTextBase: 'var(--t1)',      // primary text
    borderRadius: 4,
    fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
  }
}
```

---

## CSS Variables (design tokens)

Defined in global CSS (see `frontend/src/index.css` or similar):

| Variable | Role |
|----------|------|
| `--bg` | Base background |
| `--bg2` | Secondary background (cards, panels) |
| `--b1` | Primary border |
| `--b2` | Secondary border |
| `--t1` | Primary text color |
| `--t2` | Secondary text (muted) |
| `--acc` | Accent color (primary actions, active states) |

---

## Typography

| Use | Size | Weight | Notes |
|-----|------|--------|-------|
| Page title | 24px | 600 | — |
| Section header | 18px | 600 | — |
| Card title | 16px | 500 | — |
| Body text | 14px | 400 | Default |
| Small/label | 12px | 400 | Badges, captions |
| Code | 13px | 400 | Monospace |

Font: `Inter` → `-apple-system` → `system-ui` → `sans-serif`

---

## Issue type colors and icons

Defined in `frontend/src/lib/issue-kit.tsx`:

| Type | Color | Icon |
|------|-------|------|
| EPIC | Purple | Lightning bolt |
| STORY | Green | Book |
| TASK | Blue | Check circle |
| SUBTASK | Gray | Minus circle |
| BUG | Red | Bug |

---

## Priority colors

| Priority | Color |
|----------|-------|
| CRITICAL | Red |
| HIGH | Orange |
| MEDIUM | Yellow |
| LOW | Gray |

---

## Spacing rhythm

| Context | Value |
|---------|-------|
| Element gap | 8px |
| Component padding | 12–16px |
| Section gap | 24px |
| Page padding | 24px |

---

## Components

See [storybook.md](./storybook.md) for live component catalog.

Key reusable components:

| Component | File | Usage |
|-----------|------|-------|
| `IssuePriorityTag` | `ui/IssuePriorityTag.tsx` | Priority badge with color |
| `IssueTypeTag` | `ui/IssueTypeTag.tsx` | Type icon + label |
| `ProjectStatusBadge` | `ui/ProjectStatusBadge.tsx` | Project status indicator |
| `ProgressBar` | `ui/ProgressBar.tsx` | Sprint/release completion % |
| `AvatarGroup` | `ui/AvatarGroup.tsx` | Multiple user avatars overlap |
| `LoadingSpinner` | `common/LoadingSpinner.tsx` | Centered loading state |

---

## Adding new design tokens

1. Add CSS variable to global stylesheet
2. Reference in component styles via `var(--name)`
3. Update this doc's CSS variables table

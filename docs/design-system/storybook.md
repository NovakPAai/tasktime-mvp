# Storybook — Component Catalog

> Last updated: 2026-03-25

---

## Running Storybook

```bash
cd frontend && npm run storybook
# → opens http://localhost:6006
```

Storybook is also deployed via Chromatic (CI `chromatic.yml` workflow) for visual regression testing on every PR.

---

## What's in Storybook

All reusable UI components from `frontend/src/components/ui/`:
- `IssuePriorityTag` — priority badge in all 4 states
- `IssueTypeTag` — type indicator for all 5 issue types
- `ProjectStatusBadge` — project status variants
- `ProgressBar` — completion percentage bar
- `AvatarGroup` — overlapping user avatars (1–5+)

---

## Adding a story

Create `<ComponentName>.stories.tsx` next to the component:

```typescript
// frontend/src/components/ui/IssuePriorityTag.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { IssuePriorityTag } from './IssuePriorityTag';

const meta: Meta<typeof IssuePriorityTag> = {
  component: IssuePriorityTag,
  title: 'UI/IssuePriorityTag',
};
export default meta;

type Story = StoryObj<typeof IssuePriorityTag>;

export const High: Story = { args: { priority: 'HIGH' } };
export const Critical: Story = { args: { priority: 'CRITICAL' } };
export const Medium: Story = { args: { priority: 'MEDIUM' } };
export const Low: Story = { args: { priority: 'LOW' } };
```

---

## Visual regression (Chromatic)

CI runs Chromatic snapshot testing on every PR (`chromatic.yml`).

If Chromatic shows visual diffs:
1. Review the diff in Chromatic UI
2. If intentional → accept the change in Chromatic
3. If accidental → fix the component

Chromatic runs on Storybook 10.x.

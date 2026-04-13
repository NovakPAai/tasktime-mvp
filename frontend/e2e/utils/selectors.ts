/**
 * Shared locator helpers for board, cards, drawers.
 */
import type { Page, Locator } from '@playwright/test';

/** Board column by status (OPEN | IN_PROGRESS | REVIEW | DONE | CANCELLED) */
export function boardColumn(page: Page, status: string): Locator {
  return page.locator(`[data-testid="board-column-${status}"]`);
}

/** Board card by issue ID */
export function boardCard(page: Page, issueId: string): Locator {
  return page.locator(`[data-testid="board-card-${issueId}"]`);
}

/** Any visible Ant Design modal */
export function modal(page: Page): Locator {
  return page.locator('.ant-modal-content').first();
}

/** Nav item by route key (e.g. "/projects", "/sprints") */
export function navItem(page: Page, route: string): Locator {
  return page.locator(`[data-testid="nav-${route.replace('/', '')}"]`);
}

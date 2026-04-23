/**
 * TTBULK-1 — Router для массовых операций над issue'ами.
 *
 * Точка входа: `/api/bulk-operations/*`.
 *
 * Фактические роуты (preview/create/get/cancel/stream/report.csv/retry-failed/list)
 * добавляются в PR-3..PR-6. В PR-1 здесь только `/ping` → 501 (Not Implemented)
 * для проверки, что mount в app.ts работает под feature-флагом.
 *
 * Gate по `features.bulkOps` — в app.ts (условный mount). При выключенном флаге
 * роутер не подключается → fall-through на default 404 Express'а.
 *
 * См. docs/tz/TTBULK-1.md §4, §13.1.
 */

import { Router, type Response } from 'express';

const router = Router();

// PR-1 stub: проверяет, что router смонтирован. Реальные роуты — PR-3+.
router.get('/bulk-operations/ping', (_req, res: Response) => {
  res.status(501).json({
    message: 'Not implemented yet. TTBULK-1 rolls out in phases — см. docs/tz/TTBULK-1.md §13.',
  });
});

export default router;

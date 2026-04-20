import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';

/**
 * TTSRH-1 PR-1 — stub-роутер для сохранённых фильтров (TTS-QL). Модели SavedFilter /
 * SavedFilterShare уже мигрированы в этой же ветке, но CRUD-логика поступит в PR-7
 * (см. §13.5 в docs/tz/TTSRH-1.md). До этого — 501.
 *
 * Gate по `features.advancedSearch` — в app.ts.
 */
const router = Router();
router.use(authenticate);

function notImplemented(endpoint: string) {
  return (_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
    res.status(501).json({
      error: 'NOT_IMPLEMENTED',
      endpoint,
      message:
        'Saved-filter endpoints are under development. See docs/tz/TTSRH-1.md — delivered in PR-7.',
    });
  };
}

router.get('/saved-filters', notImplemented('GET /saved-filters'));
router.post('/saved-filters', notImplemented('POST /saved-filters'));
router.get('/saved-filters/:id', notImplemented('GET /saved-filters/:id'));
router.patch('/saved-filters/:id', notImplemented('PATCH /saved-filters/:id'));
router.delete('/saved-filters/:id', notImplemented('DELETE /saved-filters/:id'));
router.post('/saved-filters/:id/favorite', notImplemented('POST /saved-filters/:id/favorite'));
router.post('/saved-filters/:id/share', notImplemented('POST /saved-filters/:id/share'));

export default router;

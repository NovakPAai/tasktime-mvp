import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';

/**
 * TTSRH-1 PR-1 — stub-роутер для TTS-QL-поиска. На этой фазе модуль примонтирован,
 * но все эндпоинты возвращают 501 Not Implemented. Это позволяет:
 *   1) проверить на staging, что mount проходит без коллизий путей;
 *   2) задать публичные контракты путей (см. §5.6 в docs/tz/TTSRH-1.md) до
 *      появления парсера/компилятора/валидатора;
 *   3) дать фронту повод «уметь» обрабатывать 501 уже сейчас.
 *
 * Фактическая реализация поступит в PR-2..PR-8 (см. §13.4–13.5 ТЗ).
 * Gate по `features.advancedSearch` происходит в app.ts: при выключенном флаге весь
 * префикс `/api/search` даёт 404, поэтому здесь делаем только authenticate.
 */
const router = Router();
router.use(authenticate);

function notImplemented(endpoint: string) {
  return (_req: Request, res: Response): void => {
    res.status(501).json({
      error: 'NOT_IMPLEMENTED',
      endpoint,
      message:
        'TTS-QL search endpoints are under development. See docs/tz/TTSRH-1.md — delivered in PR-5..PR-8.',
    });
  };
}

router.post('/search/issues', notImplemented('POST /search/issues'));
router.post('/search/validate', notImplemented('POST /search/validate'));
router.get('/search/suggest', notImplemented('GET /search/suggest'));
router.post('/search/export', notImplemented('POST /search/export'));
router.get('/search/schema', notImplemented('GET /search/schema'));

export default router;

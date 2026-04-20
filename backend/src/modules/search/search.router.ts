import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/auth.js';
import { validate as validateDto } from '../../shared/middleware/validate.js';
import { parse } from './search.parser.js';
import { validate as runValidator, createValidatorContext } from './search.validator.js';
import { SYSTEM_FIELDS } from './search.schema.js';
import { loadCustomFields } from './search.schema.loader.js';
import { functionsForVariant } from './search.functions.js';
import type { QueryVariant } from './search.types.js';

/**
 * TTSRH-1 PR-3 — live endpoints for `/search/validate` and `/search/schema`.
 *
 * Still stubbed with 501: `POST /search/issues`, `POST /search/export`,
 * `GET /search/suggest`. Those come online in PR-5 (issues/export) and PR-6
 * (suggest).
 *
 * Gate by `features.advancedSearch` happens in app.ts — mount is conditional.
 */

const router = Router();
router.use(authenticate);

function notImplemented(endpoint: string) {
  return (_req: Request, res: Response): void => {
    res.status(501).json({
      error: 'NOT_IMPLEMENTED',
      endpoint,
      message:
        'TTS-QL endpoint is under development. See docs/tz/TTSRH-1.md — delivered in PR-5..PR-8.',
    });
  };
}

// ─── POST /search/validate ──────────────────────────────────────────────────

const validateDtoSchema = z.object({
  jql: z.string().max(10_000),
  variant: z.enum(['default', 'checkpoint']).optional(),
});

router.post(
  '/search/validate',
  validateDto(validateDtoSchema),
  async (req: Request, res: Response, next): Promise<void> => {
    try {
      const { jql, variant } = req.body as z.infer<typeof validateDtoSchema>;
      const parseResult = parse(jql);
      if (!parseResult.ast) {
        res.json({
          valid: false,
          errors: parseResult.errors,
          warnings: [],
          ast: null,
        });
        return;
      }
      const customFields = await loadCustomFields();
      const ctx = createValidatorContext({
        variant: (variant as QueryVariant | undefined) ?? 'default',
        customFields,
      });
      const result = runValidator(parseResult.ast, ctx);
      res.json({
        valid: result.valid && parseResult.errors.length === 0,
        errors: [...parseResult.errors, ...result.errors],
        warnings: result.warnings,
        ast: parseResult.ast,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /search/schema ─────────────────────────────────────────────────────

router.get(
  '/search/schema',
  async (req: Request, res: Response, next): Promise<void> => {
    try {
      const variant = (req.query.variant === 'checkpoint' ? 'checkpoint' : 'default') as QueryVariant;
      const customFields = await loadCustomFields();
      res.json({
        variant,
        fields: [
          ...SYSTEM_FIELDS.map((f) => ({
            name: f.name,
            label: f.label,
            type: f.type,
            synonyms: f.synonyms,
            operators: f.operators,
            sortable: f.sortable,
            custom: false,
            description: f.description ?? null,
          })),
          ...customFields.map((cf) => ({
            name: cf.name,
            label: cf.name,
            type: cf.type,
            synonyms: [] as string[],
            operators: cf.operators,
            sortable: false,
            custom: true,
            uuid: cf.id,
            description: null,
          })),
        ],
        functions: functionsForVariant(variant).map((fn) => ({
          name: fn.name,
          args: fn.args,
          returnType: fn.returnType,
          phase: fn.phase,
          description: fn.description,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Still-stubbed endpoints ────────────────────────────────────────────────

router.post('/search/issues', notImplemented('POST /search/issues'));
router.get('/search/suggest', notImplemented('GET /search/suggest'));
router.post('/search/export', notImplemented('POST /search/export'));

export default router;

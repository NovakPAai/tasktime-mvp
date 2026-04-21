import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/auth.js';
import { validate as validateDto } from '../../shared/middleware/validate.js';
import { prisma } from '../../prisma/client.js';
import { hasGlobalProjectReadAccess } from '../../shared/auth/roles.js';
import type { AuthRequest } from '../../shared/types/index.js';
import { parse } from './search.parser.js';
import { validate as runValidator, createValidatorContext } from './search.validator.js';
import { SYSTEM_FIELDS } from './search.schema.js';
import { loadCustomFields } from './search.schema.loader.js';
import { functionsForVariant } from './search.functions.js';
import { searchIssues } from './search.service.js';
import { searchRateLimit } from './search.rate-limit.js';
import { suggest } from './search.suggest.js';
import { exportIssuesToCsv, exportIssuesToXlsx } from './search.export.js';
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
          // Map internal validator-only pseudo-types (OFFSET / ISSUE_KEY / ANY) to
          // surface types the editor/frontend can render — they're not TTS-QL types.
          args: fn.args.map((a) => ({
            name: a.name,
            type:
              a.type === 'OFFSET' ? 'TEXT' :
              a.type === 'ISSUE_KEY' ? 'TEXT' :
              a.type === 'ANY' ? 'TEXT' :
              a.type,
            optional: a.optional,
          })),
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

// ─── POST /search/issues ────────────────────────────────────────────────────

const issuesDtoSchema = z.object({
  jql: z.string().max(10_000),
  startAt: z.number().int().min(0).max(10_000).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

router.post(
  '/search/issues',
  searchRateLimit,
  validateDto(issuesDtoSchema),
  async (req: Request, res: Response, next): Promise<void> => {
    try {
      const auth = req as AuthRequest;
      if (!auth.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      const { projectIds, overflowed } = await resolveAccessibleProjectIds(auth);
      const { jql, startAt, limit } = req.body as z.infer<typeof issuesDtoSchema>;
      const output = await searchIssues(
        { jql, startAt, limit },
        { userId: auth.user.userId, accessibleProjectIds: projectIds },
      );
      if (output.kind === 'error') {
        res.status(output.status).json({
          error: output.code,
          message: output.message,
          parseErrors: output.parseErrors,
          validationErrors: output.validationErrors,
          compileErrors: output.compileErrors,
        });
        return;
      }
      res.json({
        total: output.total,
        startAt: output.startAt,
        limit: output.limit,
        issues: output.issues,
        warnings: output.warnings,
        compileWarnings: output.compileWarnings,
        // When the user has access to more than `MAX_ACCESSIBLE_PROJECTS` projects
        // (realistic only for global-read roles in huge tenants), tell them that
        // search results may be incomplete.
        ...(overflowed ? { projectScopeOverflowed: true } : {}),
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Cap the number of project ids we embed in a single query. Postgres chokes on
 * very large `IN (...)` lists, and we don't want a global-read user on a
 * 100k-project tenant to allocate megabytes of uuids per request. Beyond this
 * cap we emit a warning — admins see it, everyone else's search still works.
 */
const MAX_ACCESSIBLE_PROJECTS = 5000;

export interface AccessibleProjectsResult {
  projectIds: string[];
  overflowed: boolean;
}

/**
 * Compute the set of project ids the authenticated user may see. Mirrors the
 * pattern in `issues.router.ts:requireIssueAccess` — global-read roles see
 * everything; others are scoped to their direct project memberships. The
 * compiler adds `projectId IN (accessibleProjectIds)` as AND[0] (R3) so this
 * is the single authoritative input for RBAC scoping.
 */
async function resolveAccessibleProjectIds(req: AuthRequest): Promise<AccessibleProjectsResult> {
  if (!req.user) return { projectIds: [], overflowed: false };
  if (hasGlobalProjectReadAccess(req.user.systemRoles)) {
    const all = await prisma.project.findMany({
      select: { id: true },
      take: MAX_ACCESSIBLE_PROJECTS + 1, // +1 sentinel to detect overflow
    });
    const overflowed = all.length > MAX_ACCESSIBLE_PROJECTS;
    return {
      projectIds: overflowed ? all.slice(0, MAX_ACCESSIBLE_PROJECTS).map((p) => p.id) : all.map((p) => p.id),
      overflowed,
    };
  }
  const memberships = await prisma.userProjectRole.findMany({
    where: { userId: req.user.userId },
    select: { projectId: true },
    take: MAX_ACCESSIBLE_PROJECTS + 1,
  });
  const overflowed = memberships.length > MAX_ACCESSIBLE_PROJECTS;
  return {
    projectIds: (overflowed ? memberships.slice(0, MAX_ACCESSIBLE_PROJECTS) : memberships).map((m) => m.projectId),
    overflowed,
  };
}

// ─── GET /search/suggest ────────────────────────────────────────────────────

const suggestQuerySchema = z.object({
  jql: z.string().max(10_000).optional(),
  cursor: z.string().optional(),
  field: z.string().max(200).optional(),
  operator: z.string().max(20).optional(),
  prefix: z.string().max(200).optional(),
  variant: z.enum(['default', 'checkpoint']).optional(),
});

router.get(
  '/search/suggest',
  // Autocomplete is called on every keystroke (editor debounces 150ms on the
  // frontend), but spam-protect anyway — 30 req/min caps an abusive client at
  // one request every 2s, still usable by a real user typing at ~10 chars/s
  // after debounce applies.
  searchRateLimit,
  validateDto(suggestQuerySchema, 'query'),
  async (req: Request, res: Response, next): Promise<void> => {
    try {
      const auth = req as AuthRequest;
      if (!auth.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      const { projectIds } = await resolveAccessibleProjectIds(auth);
      const { jql, cursor: cursorRaw, field, operator, prefix, variant } =
        req.query as z.infer<typeof suggestQuerySchema>;
      const cursor = Number.parseInt(cursorRaw ?? '0', 10);
      const customFields = await loadCustomFields();
      const result = await suggest(
        jql ?? '',
        Number.isFinite(cursor) ? cursor : 0,
        {
          userId: auth.user.userId,
          accessibleProjectIds: projectIds,
          variant: (variant === 'checkpoint' ? 'checkpoint' : 'default') as QueryVariant,
          field,
          operator,
          prefix,
        },
        customFields,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /search/export ────────────────────────────────────────────────────

const exportDtoSchema = z.object({
  jql: z.string().max(10_000),
  format: z.enum(['csv', 'xlsx']),
  // Column allow-list upper bound — guard against XLSX with 10K sparse columns.
  columns: z.array(z.string().min(1).max(100)).max(50).optional(),
});

router.post(
  '/search/export',
  searchRateLimit,
  validateDto(exportDtoSchema),
  async (req: Request, res: Response, next): Promise<void> => {
    try {
      const auth = req as AuthRequest;
      if (!auth.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      const { projectIds } = await resolveAccessibleProjectIds(auth);
      const { jql, format, columns } = req.body as z.infer<typeof exportDtoSchema>;
      const ctx = { userId: auth.user.userId, accessibleProjectIds: projectIds };
      if (format === 'csv') {
        await exportIssuesToCsv({ jql, columns }, ctx, res);
      } else {
        await exportIssuesToXlsx({ jql, columns }, ctx, res);
      }
    } catch (err) {
      // If we already started streaming, we can't send a JSON error — just drop
      // the connection and let the global error handler log it. If headers
      // haven't been sent yet, next(err) produces the standard 500 JSON.
      if (res.headersSent) {
        console.error('export stream error after headers', err);
        res.end();
        return;
      }
      next(err);
    }
  },
);

export default router;

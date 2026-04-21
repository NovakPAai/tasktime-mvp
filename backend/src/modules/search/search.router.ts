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
import type { QueryVariant } from './search.types.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';

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
  asyncHandler(async (req: Request, res: Response) => {
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
  }),
);

// ─── GET /search/schema ─────────────────────────────────────────────────────

router.get(
  '/search/schema',
  asyncHandler(async (req: Request, res: Response) => {
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
  }),
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
  asyncHandler(async (req: Request, res: Response) => {
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
  }),
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

// ─── Still-stubbed endpoints ────────────────────────────────────────────────

router.get('/search/suggest', notImplemented('GET /search/suggest'));
router.post('/search/export', notImplemented('POST /search/export'));

export default router;

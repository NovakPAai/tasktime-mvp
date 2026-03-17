import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { createLinkDto, createLinkTypeDto, updateLinkTypeDto } from './links.dto.js';
import * as linksService from './links.service.js';
import type { AuthRequest } from '../../shared/types/index.js';

const router = Router();

router.use(authenticate);

// ===== Issue Links =====

// GET /issues/:id/links — все связи задачи
router.get('/issues/:id/links', async (req, res, next) => {
  try {
    const links = await linksService.getIssueLinks(req.params.id as string);
    res.json(links);
  } catch (err) {
    next(err);
  }
});

// POST /issues/:id/links — создать связь
router.post('/issues/:id/links', validate(createLinkDto), async (req: AuthRequest, res, next) => {
  try {
    const { targetIssueId, linkTypeId } = req.body as { targetIssueId: string; linkTypeId: string };
    const link = await linksService.createLink(req.params.id as string, targetIssueId, linkTypeId, req.user!.userId);
    res.status(201).json(link);
  } catch (err) {
    next(err);
  }
});

// DELETE /issues/:id/links/:linkId — удалить связь
router.delete('/issues/:id/links/:linkId', async (req: AuthRequest, res, next) => {
  try {
    await linksService.deleteLink(req.params.linkId as string, req.user!.userId, req.user!.role);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ===== Link Types (Admin) =====

// GET /admin/link-types — список всех типов связей
router.get('/admin/link-types', requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const types = await linksService.listLinkTypes(includeInactive);
    res.json(types);
  } catch (err) {
    next(err);
  }
});

// POST /admin/link-types — создать тип связи
router.post('/admin/link-types', requireRole('ADMIN'), validate(createLinkTypeDto), async (req, res, next) => {
  try {
    const type = await linksService.createLinkType(req.body as { name: string; outboundName: string; inboundName: string });
    res.status(201).json(type);
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/link-types/:id — обновить / включить / отключить
router.patch('/admin/link-types/:id', requireRole('ADMIN'), validate(updateLinkTypeDto), async (req, res, next) => {
  try {
    const type = await linksService.updateLinkType(req.params.id as string, req.body as {
      name?: string;
      outboundName?: string;
      inboundName?: string;
      isActive?: boolean;
    });
    res.json(type);
  } catch (err) {
    next(err);
  }
});

export default router;

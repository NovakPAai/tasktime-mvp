import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { createLinkDto, createLinkTypeDto, updateLinkTypeDto } from './links.dto.js';
import * as linksService from './links.service.js';
import { asyncHandler, authHandler } from '../../shared/utils/async-handler.js';

const router = Router();

router.use(authenticate);

// ===== Issue Links =====

// GET /issues/:id/links — все связи задачи
router.get('/issues/:id/links', asyncHandler(async (req, res) => {
  const links = await linksService.getIssueLinks(req.params.id as string);
  res.json(links);
}));

// POST /issues/:id/links — создать связь
router.post('/issues/:id/links', validate(createLinkDto), authHandler(async (req, res) => {
  const { targetIssueId, linkTypeId } = req.body as { targetIssueId: string; linkTypeId: string };
  const link = await linksService.createLink(req.params.id as string, targetIssueId, linkTypeId, req.user!.userId);
  res.status(201).json(link);
}));

// DELETE /issues/:id/links/:linkId — удалить связь
router.delete('/issues/:id/links/:linkId', authHandler(async (req, res) => {
  await linksService.deleteLink(req.params.linkId as string, req.user!.userId, req.user!.systemRoles);
  res.status(204).send();
}));

// ===== Link Types =====

// GET /link-types — список активных типов связей (для всех авторизованных)
router.get('/link-types', asyncHandler(async (req, res) => {
  const types = await linksService.listLinkTypes(false);
  res.json(types);
}));

// ===== Link Types (Admin) =====

// GET /admin/link-types — список всех типов связей
router.get('/admin/link-types', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  const types = await linksService.listLinkTypes(includeInactive);
  res.json(types);
}));

// POST /admin/link-types — создать тип связи
router.post('/admin/link-types', requireRole('ADMIN'), validate(createLinkTypeDto), asyncHandler(async (req, res) => {
  const type = await linksService.createLinkType(req.body as { name: string; outboundName: string; inboundName: string });
  res.status(201).json(type);
}));

// PATCH /admin/link-types/:id — обновить / включить / отключить
router.patch('/admin/link-types/:id', requireRole('ADMIN'), validate(updateLinkTypeDto), asyncHandler(async (req, res) => {
  const type = await linksService.updateLinkType(req.params.id as string, req.body as {
    name?: string;
    outboundName?: string;
    inboundName?: string;
    isActive?: boolean;
  });
  res.json(type);
}));

export default router;

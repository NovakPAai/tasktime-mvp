import { PrismaClient, Prisma } from '@prisma/client';
import type { AuthRequest } from '../types/index.js';

const prisma = new PrismaClient();

export async function logAudit(
  req: AuthRequest,
  action: string,
  entityType: string,
  entityId: string,
  details?: Record<string, unknown>,
) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entityType,
        entityId,
        userId: req.user?.userId ?? null,
        details: details ? (details as Prisma.InputJsonValue) : undefined,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}

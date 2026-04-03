import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client.js'; // CVE-17: use singleton
import type { AuthRequest } from '../types/index.js';

// CVE-12: fields that must never appear in audit log details
const SENSITIVE_FIELDS = new Set([
  'password', 'newPassword', 'currentPassword', 'passwordHash',
  'token', 'refreshToken', 'accessToken', 'secret',
]);

function sanitizeDetails(details: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (depth > 3) return details;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (SENSITIVE_FIELDS.has(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeDetails(value as Record<string, unknown>, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export async function logAudit(
  req: AuthRequest,
  action: string,
  entityType: string,
  entityId: string,
  details?: Record<string, unknown>,
) {
  try {
    const safeDetails = details ? sanitizeDetails(details) : undefined;
    await prisma.auditLog.create({
      data: {
        action,
        entityType,
        entityId,
        userId: req.user?.userId ?? null,
        details: safeDetails ? (safeDetails as Prisma.InputJsonValue) : undefined,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}

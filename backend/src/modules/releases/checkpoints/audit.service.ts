// TTMP-160 PR-8 / FR-23: checkpoint-violation audit service.
//
// Aggregates CheckpointViolationEvent rows for the admin audit page. Filters by date
// range, project, release, checkpoint type, and an "only still-open" toggle.
//
// SEC-6: router gates access strictly to SUPER_ADMIN / ADMIN / AUDITOR. The service
// layer is role-agnostic; all filtering is scope-based (what the caller asked for), not
// permission-based.

import type { Prisma } from '@prisma/client';
import { prisma } from '../../../prisma/client.js';
import type { AuditQueryDto } from './release-checkpoint.dto.js';

export interface AuditEventRow {
  id: string;
  releaseCheckpointId: string;
  releaseId: string;
  releaseName: string;
  projectKey: string | null;
  projectName: string | null;
  checkpointName: string;
  issueId: string;
  issueKey: string;
  criterionType: string;
  reason: string;
  occurredAt: string;
  resolvedAt: string | null;
}

export async function listAuditEvents(filters: AuditQueryDto): Promise<AuditEventRow[]> {
  const where: Prisma.CheckpointViolationEventWhereInput = {};

  if (filters.from || filters.to) {
    where.occurredAt = {
      ...(filters.from && { gte: new Date(`${filters.from}T00:00:00Z`) }),
      ...(filters.to && { lte: new Date(`${filters.to}T23:59:59.999Z`) }),
    };
  }
  if (filters.onlyOpen === 'true') {
    where.resolvedAt = null;
  }
  if (filters.releaseId) {
    where.releaseCheckpoint = { releaseId: filters.releaseId };
  }
  if (filters.checkpointTypeId) {
    where.releaseCheckpoint = {
      ...(where.releaseCheckpoint as object | undefined),
      checkpointTypeId: filters.checkpointTypeId,
    };
  }
  if (filters.projectId) {
    where.releaseCheckpoint = {
      ...(where.releaseCheckpoint as object | undefined),
      release: {
        OR: [
          { projectId: filters.projectId },
          { items: { some: { issue: { projectId: filters.projectId } } } },
        ],
      },
    };
  }

  const rows = await prisma.checkpointViolationEvent.findMany({
    where,
    orderBy: { occurredAt: 'desc' },
    include: {
      releaseCheckpoint: {
        select: {
          releaseId: true,
          checkpointType: { select: { name: true } },
          release: {
            select: {
              name: true,
              project: { select: { key: true, name: true } },
            },
          },
        },
      },
    },
    take: filters.limit ?? 500,
  });

  return rows.map((e) => ({
    id: e.id,
    releaseCheckpointId: e.releaseCheckpointId,
    releaseId: e.releaseCheckpoint.releaseId,
    releaseName: e.releaseCheckpoint.release.name,
    projectKey: e.releaseCheckpoint.release.project?.key ?? null,
    projectName: e.releaseCheckpoint.release.project?.name ?? null,
    checkpointName: e.releaseCheckpoint.checkpointType.name,
    issueId: e.issueId,
    issueKey: e.issueKey,
    criterionType: e.criterionType,
    reason: e.reason,
    occurredAt: e.occurredAt.toISOString(),
    resolvedAt: e.resolvedAt ? e.resolvedAt.toISOString() : null,
  }));
}

/**
 * SEC-9: CSV must contain only minimally identifying fields — no issue description,
 * assignee email, custom-field values. We echo exactly the fields already visible in the
 * UI and nothing more.
 */
export function toCsv(rows: AuditEventRow[]): string {
  const header = [
    'event_id',
    'occurred_at',
    'resolved_at',
    'project_key',
    'release_name',
    'checkpoint_name',
    'issue_key',
    'criterion_type',
    'reason',
  ];
  const escape = (s: string | null | undefined): string => {
    if (s === null || s === undefined) return '';
    const needsQuoting = /[,"\n\r]/.test(s);
    if (!needsQuoting) return s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        escape(r.id),
        escape(r.occurredAt),
        escape(r.resolvedAt ?? ''),
        escape(r.projectKey ?? ''),
        escape(r.releaseName),
        escape(r.checkpointName),
        escape(r.issueKey),
        escape(r.criterionType),
        escape(r.reason),
      ].join(','),
    );
  }
  // UTF-8 BOM so Excel auto-detects Cyrillic; CRLF per RFC 4180 so strict parsers are happy.
  return '\uFEFF' + lines.join('\r\n');
}

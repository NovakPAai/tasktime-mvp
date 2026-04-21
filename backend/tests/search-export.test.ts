import { beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { createAdminUser, getIssueTypeConfigId, request } from './helpers.js';

const prisma = new PrismaClient();

let adminToken: string;
let projectId: string;
let projectKey: string;
let taskTypeId: string;

beforeEach(async () => {
  await prisma.issueCustomFieldValue.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.customField.deleteMany();
  await prisma.project.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.userSystemRole.deleteMany();
  await prisma.user.deleteMany();

  const admin = await createAdminUser();
  adminToken = admin.accessToken;

  const proj = await request
    .post('/api/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Export', key: 'EXP' });
  projectId = proj.body.id;
  projectKey = proj.body.key;

  taskTypeId = await getIssueTypeConfigId('TASK');

  // Seed three issues with different priorities so we can filter in JQL.
  for (const [i, priority] of [
    [1, 'CRITICAL'],
    [2, 'HIGH'],
    [3, 'LOW'],
  ] as const) {
    await request
      .post(`/api/projects/${projectId}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Issue ${i}`,
        issueTypeConfigId: taskTypeId,
        priority,
        description: priority === 'HIGH' ? 'has,comma "and quote"' : null,
      });
  }
});

function parseCsv(raw: string): string[][] {
  // Strip UTF-8 BOM.
  const body = raw.replace(/^\uFEFF/, '');
  const lines = body.split('\n').filter((l) => l.length > 0 && !l.startsWith('#'));
  return lines.map((line) => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else {
        if (ch === ',') {
          out.push(cur);
          cur = '';
        } else if (ch === '"') {
          inQuotes = true;
        } else {
          cur += ch;
        }
      }
    }
    out.push(cur);
    return out;
  });
}

describe('POST /api/search/export — CSV', () => {
  it('returns CSV with default columns when none specified', async () => {
    const res = await request
      .post('/api/search/export')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ jql: `project = "${projectKey}"`, format: 'csv' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('search-export.csv');

    const rows = parseCsv(res.text);
    // header + 3 issues
    expect(rows.length).toBe(4);
    const header = rows[0];
    expect(header).toContain('Ключ'); // key label
    expect(header).toContain('Название'); // summary label
  });

  it('respects requested columns (order + subset)', async () => {
    const res = await request
      .post('/api/search/export')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        jql: `project = "${projectKey}"`,
        format: 'csv',
        columns: ['key', 'priority'],
      });

    expect(res.status).toBe(200);
    const rows = parseCsv(res.text);
    expect(rows[0]).toHaveLength(2);
    expect(rows.length).toBe(4);
    // data rows have exactly 2 columns
    for (let i = 1; i < rows.length; i++) expect(rows[i]).toHaveLength(2);
    // first column is a key like "EXP-N"
    expect(rows[1][0]).toMatch(/^EXP-\d+$/);
  });

  it('drops unknown columns silently', async () => {
    const res = await request
      .post('/api/search/export')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        jql: `project = "${projectKey}"`,
        format: 'csv',
        columns: ['key', 'nonexistentColumn', 'priority'],
      });

    expect(res.status).toBe(200);
    const rows = parseCsv(res.text);
    // 2 known columns → 2 cells per row
    expect(rows[0]).toHaveLength(2);
  });

  it('returns 400 if ALL requested columns are unknown', async () => {
    const res = await request
      .post('/api/search/export')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        jql: `project = "${projectKey}"`,
        format: 'csv',
        columns: ['nonexistent1', 'nonexistent2'],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('NO_VALID_COLUMNS');
  });

  it('wraps cells starting with =/+/-/@ to neutralise CSV formula injection', async () => {
    // Create a project whose name is an Excel formula payload.
    const danger = await request
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '=HYPERLINK("http://evil.example/cookie","click")', key: 'DGR' });

    await request
      .post(`/api/projects/${danger.body.id}/issues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: '+cmd|" /C calc"!A1', issueTypeConfigId: taskTypeId });

    const res = await request
      .post('/api/search/export')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        jql: `project = "DGR"`,
        format: 'csv',
        columns: ['project', 'summary'],
      });
    expect(res.status).toBe(200);
    // The raw response must have the formula cell wrapped in quotes — verify by
    // substring search (before CSV parse, which would strip quoting).
    expect(res.text).toContain('"=HYPERLINK(');
    expect(res.text).toContain('"+cmd|');
    // Round-trip through the test parser to confirm the values survive.
    const rows = parseCsv(res.text);
    expect(rows[1][0]).toBe('=HYPERLINK("http://evil.example/cookie","click")');
    expect(rows[1][1]).toBe('+cmd|" /C calc"!A1');
  });

  it('escapes CSV special chars (comma, quote, newline)', async () => {
    const res = await request
      .post('/api/search/export')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        jql: `project = "${projectKey}" AND priority = HIGH`,
        format: 'csv',
        columns: ['key', 'description'],
      });
    expect(res.status).toBe(200);
    const rows = parseCsv(res.text);
    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe('has,comma "and quote"');
  });

  it('returns 400 on PARSE_ERROR', async () => {
    const res = await request
      .post('/api/search/export')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ jql: 'project = (((((', format: 'csv' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PARSE_ERROR');
  });

  it('returns 400 on VALIDATION_ERROR (unknown field)', async () => {
    const res = await request
      .post('/api/search/export')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ jql: 'foobar = "X"', format: 'csv' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 401 without auth', async () => {
    const res = await request
      .post('/api/search/export')
      .send({ jql: `project = "${projectKey}"`, format: 'csv' });
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid format', async () => {
    const res = await request
      .post('/api/search/export')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ jql: `project = "${projectKey}"`, format: 'pdf' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/search/export — XLSX', () => {
  it('returns a binary stream with xlsx content-type', async () => {
    const res = await request
      .post('/api/search/export')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('accept', 'application/octet-stream')
      .buffer(true)
      .parse((resIn, cb) => {
        const chunks: Buffer[] = [];
        resIn.on('data', (c: Buffer) => chunks.push(c));
        resIn.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .send({ jql: `project = "${projectKey}"`, format: 'xlsx' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    const body = res.body as Buffer;
    expect(body.length).toBeGreaterThan(100);
    // XLSX = ZIP archive, first bytes are "PK\x03\x04".
    expect(body[0]).toBe(0x50);
    expect(body[1]).toBe(0x4b);
  });
});

describe('RBAC scope', () => {
  it('non-member user sees 0 rows for a filter on a project they do not access', async () => {
    // Create a plain user (no admin system role → no global read access).
    const reg = await request
      .post('/api/auth/register')
      .send({ email: 'plain@test.com', password: 'Password123', name: 'Plain' });
    const plainToken = reg.body.accessToken;

    const res = await request
      .post('/api/search/export')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({ jql: `project = "${projectKey}"`, format: 'csv' });

    expect(res.status).toBe(200);
    const rows = parseCsv(res.text);
    expect(rows.length).toBe(1); // header only, no data rows
  });
});

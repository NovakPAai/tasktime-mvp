#!/usr/bin/env node
/**
 * Забрать/вернуть любые задачи TaskTime по ключу (TTMP-83, LIVE-5 и т.д.).
 *
 * pull: GET /api/issues/key/:key для каждого ключа → сохранить snapshot, опционально IN_PROGRESS.
 * push: по snapshot выставить aiExecutionStatus = DONE и добавить комментарий (из файла или дефолт).
 *
 * Env: TASKTIME_BASE_URL (default http://localhost:3000), TASKTIME_ACCESS_TOKEN (required)
 *
 * Usage:
 *   node sync-issue-with-battle.mjs pull TTMP-83 [TTMP-84 ...] [--set-in-progress] [--out FILE]
 *   node sync-issue-with-battle.mjs push TTMP-83 [TTMP-84 ...] [--snapshot FILE] [--comments FILE]
 */

import path from 'path';
import fs from 'fs';

const baseUrl = (process.env.TASKTIME_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const token = process.env.TASKTIME_ACCESS_TOKEN;

function authHeaders() {
  if (!token) {
    throw new Error('TASKTIME_ACCESS_TOKEN is required');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function fetchIssue(key) {
  const res = await fetch(`${baseUrl}/api/issues/key/${encodeURIComponent(key)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GET ${key}: ${res.status} ${t}`);
  }
  return res.json();
}

async function patchAiStatus(issueId, aiExecutionStatus) {
  const res = await fetch(`${baseUrl}/api/issues/${issueId}/ai-status`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ aiExecutionStatus }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`PATCH ai-status ${issueId}: ${res.status} ${t}`);
  }
  return res.json();
}

async function postComment(issueId, body) {
  const res = await fetch(`${baseUrl}/api/issues/${issueId}/comments`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`POST comment ${issueId}: ${res.status} ${t}`);
  }
  return res.json();
}

function parseArgs() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (cmd !== 'pull' && cmd !== 'push') {
    return { cmd: null, keys: [], setInProgress: false, out: null, snapshot: null, comments: null };
  }

  const keys = [];
  let setInProgress = false;
  let out = null;
  let snapshot = null;
  let comments = null;

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--set-in-progress') setInProgress = true;
    else if (a === '--out' && args[i + 1]) {
      out = args[++i];
    } else if (a === '--snapshot' && args[i + 1]) {
      snapshot = args[++i];
    } else if (a === '--comments' && args[i + 1]) {
      comments = args[++i];
    } else if (/^[A-Za-z]{2,10}-\d+$/.test(a)) {
      keys.push(a);
    }
  }

  return { cmd, keys, setInProgress, out, snapshot, comments };
}

function defaultSnapshotPath(keys) {
  const slug = keys.join('-').replace(/[^A-Za-z0-9-]/g, '');
  return `docs/plans/snapshot-${slug}.json`;
}

function defaultCommentsPath(keys) {
  const slug = keys.join('-').replace(/[^A-Za-z0-9-]/g, '');
  return `docs/plans/comments-${slug}.json`;
}

async function pull(keys, setInProgress, outPath) {
  const cwd = process.cwd();
  const repoRoot = cwd.endsWith('backend') ? path.resolve(cwd, '..') : cwd;
  const snapshotPath = outPath || defaultSnapshotPath(keys);
  const snapshotFull = path.isAbsolute(snapshotPath) ? snapshotPath : path.join(repoRoot, snapshotPath);

  const snapshot = {};
  for (const key of keys) {
    const issue = await fetchIssue(key);
    snapshot[key] = {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      description: issue.description ?? '',
      status: issue.status,
      aiExecutionStatus: issue.aiExecutionStatus ?? 'NOT_STARTED',
      type: issue.type,
      projectKey: issue.project?.key,
    };
    console.log(`${key}: ${issue.title} (${snapshot[key].aiExecutionStatus})`);
  }

  fs.mkdirSync(path.dirname(snapshotFull), { recursive: true });
  fs.writeFileSync(snapshotFull, JSON.stringify(snapshot, null, 2), 'utf8');
  console.log(`Snapshot: ${snapshotPath}`);

  if (setInProgress) {
    for (const key of keys) {
      await patchAiStatus(snapshot[key].id, 'IN_PROGRESS');
      console.log(`${key}: aiExecutionStatus = IN_PROGRESS`);
    }
  }
}

async function push(keys, snapshotPath, commentsPath) {
  const cwd = process.cwd();
  const repoRoot = cwd.endsWith('backend') ? path.resolve(cwd, '..') : cwd;
  const snapFull = path.isAbsolute(snapshotPath) ? snapshotPath : path.join(repoRoot, snapshotPath);
  const commentsFull = commentsPath
    ? (path.isAbsolute(commentsPath) ? commentsPath : path.join(repoRoot, commentsPath))
    : path.join(repoRoot, defaultCommentsPath(keys));

  if (!fs.existsSync(snapFull)) {
    throw new Error(`Snapshot not found: ${snapshotPath}. Run pull first.`);
  }
  const snapshot = JSON.parse(fs.readFileSync(snapFull, 'utf8'));

  let comments = {};
  if (fs.existsSync(commentsFull)) {
    comments = JSON.parse(fs.readFileSync(commentsFull, 'utf8'));
  }

  for (const key of keys) {
    const entry = snapshot[key];
    if (!entry) {
      console.warn(`Skip ${key}: not in snapshot`);
      continue;
    }
    await patchAiStatus(entry.id, 'DONE');
    console.log(`${key}: aiExecutionStatus = DONE`);
    const body = comments[key] || `Задача закрыта агентом.`;
    await postComment(entry.id, body);
    console.log(`${key}: comment posted`);
  }
  console.log('Push complete.');
}

const { cmd, keys, setInProgress, out, snapshot, comments } = parseArgs();

if (!cmd) {
  console.log(`
Usage:
  # Забрать одну или несколько задач (snapshot в docs/plans/snapshot-<KEYS>.json)
  TASKTIME_ACCESS_TOKEN=<token> node sync-issue-with-battle.mjs pull TTMP-83 [TTMP-84 ...] [--set-in-progress] [--out FILE]

  # Вернуть на бой: DONE + комментарии (комментарии из docs/plans/comments-<KEYS>.json или дефолт)
  TASKTIME_ACCESS_TOKEN=<token> node sync-issue-with-battle.mjs push TTMP-83 [TTMP-84 ...] [--snapshot FILE] [--comments FILE]

Optional: TASKTIME_BASE_URL=http://localhost:3000 (default)

Examples:
  node sync-issue-with-battle.mjs pull TTMP-83 --set-in-progress
  node sync-issue-with-battle.mjs pull TTMP-81 TTMP-82 TTMP-83 TTMP-84 --set-in-progress --out docs/plans/my-snapshot.json
  node sync-issue-with-battle.mjs push TTMP-83 --snapshot docs/plans/snapshot-TTMP-83.json
`);
  process.exit(1);
}

if (keys.length === 0) {
  console.error('Error: specify at least one issue key (e.g. TTMP-83)');
  process.exit(1);
}

const snapshotPath = snapshot || defaultSnapshotPath(keys);

if (cmd === 'pull') {
  pull(keys, setInProgress, out || snapshotPath).catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  push(keys, snapshotPath, comments).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

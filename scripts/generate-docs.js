#!/usr/bin/env node
/**
 * Flow Universe documentation generator
 *
 * Modes:
 *   --changelog  Update docs/CHANGELOG.md from git log (grouped by author)
 *   --api        Regenerate docs/api/reference.md from OpenAPI spec
 *   --stale      Check which doc files may be stale based on source changes
 *   --all        Run all three (default when no flag given)
 *
 * Usage:
 *   node scripts/generate-docs.js
 *   node scripts/generate-docs.js --changelog
 *   node scripts/generate-docs.js --api
 *   node scripts/generate-docs.js --stale
 *   make docs
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STATE_FILE = join(ROOT, '.doc-sync-state');
const CHANGELOG_FILE = join(ROOT, 'docs', 'CHANGELOG.md');

// Map: source file pattern → doc file to update
const DOC_MAPPING = [
  { pattern: /backend\/src\/modules\/.*\/.*\.router\.ts/, doc: 'docs/api/reference.md', hint: 'API routes changed' },
  { pattern: /backend\/src\/prisma\/schema\.prisma/, doc: 'docs/architecture/data-model.md', hint: 'Prisma schema changed' },
  { pattern: /backend\/src\/app\.ts/, doc: 'docs/architecture/backend-modules.md', hint: 'Module mount changed' },
  { pattern: /frontend\/src\/App\.tsx/, doc: 'docs/architecture/frontend-architecture.md', hint: 'Frontend routes changed' },
  { pattern: /frontend\/src\/pages\//, doc: 'docs/user-manual/features/', hint: 'Frontend pages changed' },
  { pattern: /frontend\/src\/components\//, doc: 'docs/design-system/overview.md', hint: 'UI components changed' },
  { pattern: /deploy\//, doc: 'docs/guides/deployment.md', hint: 'Deployment config changed' },
  { pattern: /\.github\/workflows\//, doc: 'docs/guides/deployment.md', hint: 'CI/CD workflows changed' },
];

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function readState() {
  if (!existsSync(STATE_FILE)) return { lastSync: null };
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastSync: null };
  }
}

function writeState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── CHANGELOG ────────────────────────────────────────────────────────────────

function updateChangelog() {
  console.log('\n📋 Updating CHANGELOG.md...');

  const state = readState();
  const since = state.lastSync;

  // Get commits since last sync (or all if first run)
  const sinceArg = since ? `${since}..HEAD` : '';
  let gitLog;
  try {
    gitLog = run(
      `git log ${sinceArg} --pretty=format:"%H|%an|%ae|%s|%ai" --no-merges`
    );
  } catch {
    console.log('  No new commits or git error — skipping');
    return;
  }

  if (!gitLog) {
    console.log('  No new commits since last sync');
    return;
  }

  const commits = gitLog
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [hash, author, email, subject, date] = line.split('|');
      return { hash: hash.slice(0, 8), author, email, subject, date: date.slice(0, 10) };
    });

  if (commits.length === 0) {
    console.log('  No new commits');
    return;
  }

  // Group by author
  const byAuthor = {};
  for (const c of commits) {
    const key = c.author;
    if (!byAuthor[key]) byAuthor[key] = [];
    byAuthor[key].push(c);
  }

  // Build markdown block
  const today = new Date().toISOString().slice(0, 10);
  let block = `## ${today}\n\n`;

  for (const [author, authorCommits] of Object.entries(byAuthor)) {
    block += `### ${author}\n\n`;
    for (const c of authorCommits) {
      block += `- \`${c.hash}\` ${c.subject} (${c.date})\n`;
    }
    block += '\n';
  }

  // Prepend to CHANGELOG
  let existing = '';
  if (existsSync(CHANGELOG_FILE)) {
    existing = readFileSync(CHANGELOG_FILE, 'utf8');
    // Remove existing header if present
    existing = existing.replace(/^# Changelog\n\n/, '');
  }

  const newContent = `# Changelog\n\n${block}${existing}`;
  writeFileSync(CHANGELOG_FILE, newContent);

  // Save current HEAD as new sync point
  const head = run('git rev-parse HEAD');
  writeState({ ...state, lastSync: head });

  console.log(`  ✓ Added ${commits.length} commits to CHANGELOG.md`);
}

// ── API DOCS ──────────────────────────────────────────────────────────────────

function updateApiDocs() {
  console.log('\n🔌 Checking API docs...');

  // Check if backend has OpenAPI export available
  const openapiFile = join(ROOT, 'backend', 'src', 'shared', 'openapi.ts');
  if (!existsSync(openapiFile)) {
    console.log('  No shared/openapi.ts found — skipping API regeneration');
    console.log('  Tip: manually update docs/api/reference.md when routes change');
    return;
  }

  // Check if routes have changed since last API doc update
  const apiRefMtime = existsSync(join(ROOT, 'docs', 'api', 'reference.md'))
    ? run('git log -1 --format=%ct -- docs/api/reference.md')
    : '0';
  const routerMtime = run(
    'git log -1 --format=%ct -- backend/src/modules/issues/issues.router.ts backend/src/app.ts'
  );

  if (parseInt(routerMtime) <= parseInt(apiRefMtime)) {
    console.log('  API reference is up to date');
    return;
  }

  console.log('  ⚠️  Router files changed after last API docs update');
  console.log('  → Manually update docs/api/reference.md or run backend OpenAPI export');
  console.log('  → Run: cd backend && npm run generate-openapi (if script exists)');
}

// ── STALENESS CHECK ───────────────────────────────────────────────────────────

function checkStale() {
  console.log('\n🔍 Checking for stale documentation...');

  // Get files changed in last commit (or working tree)
  let changedFiles;
  try {
    // Changed in last commit
    changedFiles = run('git diff --name-only HEAD~1 HEAD').split('\n').filter(Boolean);
  } catch {
    // If no previous commit (initial), check staged
    changedFiles = run('git diff --cached --name-only').split('\n').filter(Boolean);
  }

  const warnings = [];

  for (const file of changedFiles) {
    for (const mapping of DOC_MAPPING) {
      if (mapping.pattern.test(file)) {
        warnings.push(`  ⚠️  ${mapping.hint}\n     Source: ${file}\n     Update: ${mapping.doc}`);
      }
    }
  }

  if (warnings.length === 0) {
    console.log('  ✓ No documentation staleness detected');
  } else {
    console.log('\n  Documentation may need updating:\n');
    for (const w of warnings) {
      console.log(w);
    }
    console.log('');
  }

  return warnings.length;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const runChangelog = args.includes('--changelog') || args.includes('--all') || args.length === 0;
const runApi = args.includes('--api') || args.includes('--all') || args.length === 0;
const runStale = args.includes('--stale') || args.includes('--all') || args.length === 0;

console.log('Flow Universe Documentation Generator');
console.log('=================================');

if (runChangelog) updateChangelog();
if (runApi) updateApiDocs();
if (runStale) {
  const staleCount = checkStale();
  if (staleCount > 0 && process.env.CI) {
    // In CI mode, output structured warnings (for PR bot comment)
    process.exitCode = 0; // Don't fail CI, just warn
  }
}

console.log('\n✅ Done\n');

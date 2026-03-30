#!/usr/bin/env node
/**
 * Flow Universe documentation generator
 *
 * Modes:
 *   --changelog   Update docs/CHANGELOG.md from git log (grouped by author)
 *   --routes      Parse router.ts files → docs/api/reference.md (AUTO section)
 *   --schema      Parse schema.prisma  → docs/architecture/data-model.md (AUTO section)
 *   --modules     Parse app.ts         → docs/architecture/backend-modules.md (AUTO section)
 *   --frontend    Parse App.tsx        → docs/architecture/frontend-architecture.md (AUTO section)
 *   --stale       Check which doc files may be stale (for PR bot)
 *   --all         Run all of the above (default when no flag given)
 *
 * Usage:
 *   node scripts/generate-docs.js            # run all
 *   node scripts/generate-docs.js --routes
 *   node scripts/generate-docs.js --schema
 *   make docs
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STATE_FILE = join(ROOT, '.doc-sync-state');
const CHANGELOG_FILE = join(ROOT, 'docs', 'CHANGELOG.md');

// ── helpers ───────────────────────────────────────────────────────────────────

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function readState() {
  if (!existsSync(STATE_FILE)) return { lastSync: null };
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); }
  catch { return { lastSync: null }; }
}

function writeState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Replace an AUTO-GENERATED section inside a doc file.
 * Supports named keys for multiple AUTO sections per file:
 *   key=''  → <!-- AUTO-GENERATED:START --> ... <!-- AUTO-GENERATED:END -->
 *   key='x' → <!-- AUTO-GENERATED:START:x --> ... <!-- AUTO-GENERATED:END:x -->
 * If markers absent, appends at the end.
 */
function injectAutoSection(filePath, newContent, key = '') {
  const suffix = key ? `:${key}` : '';
  const START  = `<!-- AUTO-GENERATED:START${suffix} -->`;
  const END    = `<!-- AUTO-GENERATED:END${suffix} -->`;

  let existing = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';

  const block = `${START}\n${newContent.trim()}\n${END}`;

  if (existing.includes(START)) {
    const re = new RegExp(`${escapeRe(START)}[\\s\\S]*?${escapeRe(END)}`, 'm');
    existing = existing.replace(re, block);
  } else {
    existing = existing.trimEnd() + '\n\n' + block + '\n';
  }

  writeFileSync(filePath, existing);
}

function escapeRe(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── CHANGELOG ─────────────────────────────────────────────────────────────────

function updateChangelog() {
  console.log('\n📋 Updating CHANGELOG.md...');

  const state = readState();
  const since = state.lastSync;
  const sinceArg = since ? `${since}..HEAD` : '';

  let gitLog;
  try {
    gitLog = run(`git log ${sinceArg} --pretty=format:"%H|%an|%ae|%s|%ai" --no-merges`);
  } catch {
    console.log('  No new commits or git error — skipping');
    return;
  }

  if (!gitLog) { console.log('  No new commits since last sync'); return; }

  const commits = gitLog.split('\n').filter(Boolean).map(line => {
    const [hash, author, , subject, date] = line.split('|');
    return { hash: hash.slice(0, 8), author, subject, date: date.slice(0, 10) };
  });

  if (commits.length === 0) { console.log('  No new commits'); return; }

  const byAuthor = {};
  for (const c of commits) {
    if (!byAuthor[c.author]) byAuthor[c.author] = [];
    byAuthor[c.author].push(c);
  }

  const today = new Date().toISOString().slice(0, 10);
  let block = `## ${today}\n\n`;
  for (const [author, list] of Object.entries(byAuthor)) {
    block += `### ${author}\n\n`;
    for (const c of list) block += `- \`${c.hash}\` ${c.subject} (${c.date})\n`;
    block += '\n';
  }

  let existing = existsSync(CHANGELOG_FILE) ? readFileSync(CHANGELOG_FILE, 'utf8') : '';
  existing = existing.replace(/^# Changelog\n\n/, '');
  writeFileSync(CHANGELOG_FILE, `# Changelog\n\n${block}${existing}`);

  const head = run('git rev-parse HEAD');
  writeState({ ...state, lastSync: head });
  console.log(`  ✓ Added ${commits.length} commits to CHANGELOG.md`);
}

// ── ROUTES → docs/api/reference.md ───────────────────────────────────────────

const ROUTER_MODULE_MAP = {
  'auth.router.ts':                    { prefix: '/api/auth',                   name: 'Auth' },
  'users.router.ts':                   { prefix: '/api/users',                  name: 'Users' },
  'projects.router.ts':                { prefix: '/api/projects',               name: 'Projects' },
  'project-categories.router.ts':      { prefix: '/api/project-categories',     name: 'Project Categories' },
  'issues.router.ts':                  { prefix: '/api',                        name: 'Issues' },
  'boards.router.ts':                  { prefix: '/api',                        name: 'Boards' },
  'sprints.router.ts':                 { prefix: '/api',                        name: 'Sprints' },
  'releases.router.ts':                { prefix: '/api',                        name: 'Releases' },
  'comments.router.ts':                { prefix: '/api',                        name: 'Comments' },
  'time.router.ts':                    { prefix: '/api',                        name: 'Time Tracking' },
  'teams.router.ts':                   { prefix: '/api',                        name: 'Teams' },
  'admin.router.ts':                   { prefix: '/api',                        name: 'Admin' },
  'ai.router.ts':                      { prefix: '/api',                        name: 'AI' },
  'ai-sessions.router.ts':             { prefix: '/api',                        name: 'AI Sessions' },
  'links.router.ts':                   { prefix: '/api',                        name: 'Issue Links' },
  'custom-fields.router.ts':           { prefix: '/api/admin/custom-fields',    name: 'Custom Fields' },
  'field-schemas.router.ts':           { prefix: '/api/admin/field-schemas',    name: 'Field Schemas' },
  'issue-custom-fields.router.ts':     { prefix: '/api',                        name: 'Issue Custom Fields' },
  'issue-type-configs.router.ts':      { prefix: '/api',                        name: 'Issue Type Configs' },
  'issue-type-schemes.router.ts':      { prefix: '/api',                        name: 'Issue Type Schemes' },
  'monitoring.router.ts':              { prefix: '/api/monitoring',             name: 'Monitoring' },
  'webhooks.router.ts':                { prefix: '/api',                        name: 'Webhooks' },
};

function parseRouterFile(filePath, prefix) {
  const src = readFileSync(filePath, 'utf8');

  // Detect if all routes require auth (router.use(authenticate))
  const globalAuth = /router\.use\(\s*authenticate\s*\)/.test(src);

  const routes = [];
  // Match: router.METHOD('path', ...handlers)
  const re = /router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const method = m[1].toUpperCase();
    const routePath = m[2];
    const fullPath = prefix === '/api' ? `/api${routePath}` : `${prefix}${routePath}`;

    // Look for requireRole in the surrounding context (next ~200 chars)
    const context = src.slice(m.index, m.index + 300);
    let auth = globalAuth ? '🔒' : '—';
    if (context.includes('authenticate')) auth = '🔒';
    const roleMatch = context.match(/requireRole\s*\(\s*Role\.(\w+)/);
    if (roleMatch) auth = `🔒 ${roleMatch[1]}`;

    routes.push({ method, path: fullPath, auth });
  }

  return routes;
}

function generateApiRef() {
  console.log('\n🔌 Generating API reference...');

  const modulesDir = join(ROOT, 'backend', 'src', 'modules');
  if (!existsSync(modulesDir)) {
    console.log('  backend/src/modules not found — skipping');
    return;
  }

  const sections = [];

  // Walk all subdirs looking for *.router.ts
  const subdirs = readdirSync(modulesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const sub of subdirs) {
    const subDir = join(modulesDir, sub);
    const files = readdirSync(subDir).filter(f => f.endsWith('.router.ts'));
    for (const file of files) {
      const info = ROUTER_MODULE_MAP[file];
      const prefix = info?.prefix ?? '/api';
      const name   = info?.name ?? sub;

      const routes = parseRouterFile(join(subDir, file), prefix);
      if (routes.length === 0) continue;

      let table = `### ${name}\n\n`;
      table += '| Метод | Путь | Доступ |\n|-------|------|--------|\n';
      for (const r of routes) {
        table += `| \`${r.method}\` | \`${r.path}\` | ${r.auth} |\n`;
      }
      sections.push(table);
    }
  }

  const generated = `> ⚡ Авто-сгенерировано из \`backend/src/modules/**/*.router.ts\`
> 🔒 = требует JWT, 🔒 ADMIN/MANAGER = требует роль, — = публичный
> Обновляется автоматически при каждом мёрдже в \`main\`.

${sections.join('\n')}`;

  const outFile = join(ROOT, 'docs', 'api', 'reference.md');
  injectAutoSection(outFile, generated);
  console.log(`  ✓ Updated docs/api/reference.md (${sections.length} modules)`);
}

// ── SCHEMA → docs/architecture/data-model.md ─────────────────────────────────

function parseSchemaModels(src) {
  const models = [];
  const modelRe = /^model\s+(\w+)\s*\{([^}]+)\}/gm;
  let m;
  while ((m = modelRe.exec(src)) !== null) {
    const name = m[1];
    const body = m[2];
    const fields = [];
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) continue;
      const [fieldName, fieldType, ...rest] = parts;
      const attrs = rest.join(' ');
      const optional = fieldType.endsWith('?');
      const type = fieldType.replace('?', '');
      const isPk = attrs.includes('@id');
      const isUniq = attrs.includes('@unique');
      const hasDefault = attrs.match(/@default\(([^)]+)\)/);
      const note = [isPk && 'PK', isUniq && 'UNIQUE', hasDefault && `default: ${hasDefault[1]}`]
        .filter(Boolean).join(', ');
      fields.push({ name: fieldName, type, optional, note });
    }
    models.push({ name, fields });
  }
  return models;
}

function parseSchemaEnums(src) {
  const enums = [];
  const enumRe = /^enum\s+(\w+)\s*\{([^}]+)\}/gm;
  let m;
  while ((m = enumRe.exec(src)) !== null) {
    const name = m[1];
    const values = m[2].split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));
    enums.push({ name, values });
  }
  return enums;
}

function generateSchemaDoc() {
  console.log('\n🗄️  Generating data model docs...');

  const schemaFile = join(ROOT, 'backend', 'src', 'prisma', 'schema.prisma');
  if (!existsSync(schemaFile)) { console.log('  schema.prisma not found — skipping'); return; }

  const src = readFileSync(schemaFile, 'utf8');
  const models = parseSchemaModels(src);
  const enums  = parseSchemaEnums(src);

  let out = `> ⚡ Авто-сгенерировано из \`backend/src/prisma/schema.prisma\`
> Обновляется автоматически при каждом изменении схемы.

## Модели (${models.length})

`;

  for (const model of models) {
    out += `### ${model.name}\n\n`;
    out += '| Поле | Тип | Nullable | Примечание |\n|------|-----|----------|------------|\n';
    for (const f of model.fields) {
      out += `| \`${f.name}\` | \`${f.type}\` | ${f.optional ? 'да' : 'нет'} | ${f.note || ''} |\n`;
    }
    out += '\n';
  }

  out += `## Перечисления (${enums.length})\n\n`;
  for (const e of enums) {
    out += `### ${e.name}\n\n`;
    out += e.values.map(v => `- \`${v}\``).join('\n');
    out += '\n\n';
  }

  const outFile = join(ROOT, 'docs', 'architecture', 'data-model.md');
  injectAutoSection(outFile, out);
  console.log(`  ✓ Updated docs/architecture/data-model.md (${models.length} models, ${enums.length} enums)`);
}

// ── MODULES → docs/architecture/backend-modules.md ───────────────────────────

function generateModulesDoc() {
  console.log('\n📦 Generating backend modules docs...');

  const appFile = join(ROOT, 'backend', 'src', 'app.ts');
  if (!existsSync(appFile)) { console.log('  app.ts not found — skipping'); return; }

  const src = readFileSync(appFile, 'utf8');

  // Extract app.use mounts
  const mounts = [];
  const re = /app\.use\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\w+)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const prefix = m[1];
    const varName = m[2];
    if (varName === 'swaggerUi' || prefix.includes('docs')) continue;
    mounts.push({ prefix, varName });
  }

  // Map varName → module name and file
  const importRe = /import\s+\w+\s+from\s+['"`]\.\/modules\/([^/]+)\/([^'"`]+)['"`]/g;
  const importMap = {};
  while ((m = importRe.exec(src)) !== null) {
    const moduleDir = m[1];
    // extract the import variable from the import line
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const lineEnd = src.indexOf('\n', m.index);
    const importLine = src.slice(lineStart, lineEnd);
    const varMatch = importLine.match(/import\s+(?:\{[^}]+\}\s+as\s+)?(\w+)\s+from/);
    if (varMatch) importMap[varMatch[1]] = { dir: moduleDir, file: m[2] };
  }

  let table = `> ⚡ Авто-сгенерировано из \`backend/src/app.ts\`
> Обновляется автоматически при каждом изменении.

| Модуль | Префикс API | Файл роутера |
|--------|-------------|--------------|
`;

  for (const mount of mounts) {
    const info = importMap[mount.varName];
    const file = info ? `backend/src/modules/${info.dir}/${info.file}.ts` : '—';
    const name = info ? info.dir.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : mount.varName;
    table += `| ${name} | \`${mount.prefix}\` | \`${file}\` |\n`;
  }

  const outFile = join(ROOT, 'docs', 'architecture', 'backend-modules.md');
  injectAutoSection(outFile, table);
  console.log(`  ✓ Updated docs/architecture/backend-modules.md (${mounts.length} modules)`);
}

// ── FRONTEND ROUTES → docs/architecture/frontend-architecture.md ──────────────

function generateFrontendRoutes() {
  console.log('\n⚛️  Generating frontend routes docs...');

  const appFile = join(ROOT, 'frontend', 'src', 'App.tsx');
  if (!existsSync(appFile)) { console.log('  frontend/src/App.tsx not found — skipping'); return; }

  const src = readFileSync(appFile, 'utf8');

  // Extract imports to map component name → file
  const importMap = {};
  const importRe = /import\s+(\w+)\s+from\s+['"`]\.\/pages\/([^'"`]+)['"`]/g;
  let m;
  while ((m = importRe.exec(src)) !== null) {
    importMap[m[1]] = `frontend/src/pages/${m[2]}`;
  }

  // Extract <Route path="..." element={<Component .../>}
  const routes = [];
  const routeRe = /<Route\s[^>]*path=['"]([^'"]+)['"]\s[^>]*element=\{[^}]*<(\w+)/g;
  while ((m = routeRe.exec(src)) !== null) {
    const rawPath = m[1];
    const component = m[2];
    // Normalize: relative paths become /<path>
    const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    const file = importMap[component] ?? `frontend/src/pages/${component}`;
    // Check if inside PrivateRoute block (look backwards for PrivateRoute)
    const before = src.slice(0, m.index);
    const privateDepth = (before.match(/<PrivateRoute/g) || []).length -
                         (before.match(/<\/PrivateRoute/g) || []).length;
    const auth = privateDepth > 0 ? '🔒' : '—';
    routes.push({ path, component, file, auth });
  }

  let table = `> ⚡ Авто-сгенерировано из \`frontend/src/App.tsx\`
> 🔒 = требует авторизации. Обновляется автоматически.

| Путь | Компонент | Файл | Авторизация |
|------|-----------|------|-------------|
`;
  for (const r of routes) {
    table += `| \`${r.path}\` | \`${r.component}\` | \`${r.file}\` | ${r.auth} |\n`;
  }

  const outFile = join(ROOT, 'docs', 'architecture', 'frontend-architecture.md');
  injectAutoSection(outFile, table);
  console.log(`  ✓ Updated docs/architecture/frontend-architecture.md (${routes.length} routes)`);
}

// ── FEATURE FLAGS → docs/architecture/overview.md ────────────────────────────

function generateFeatureFlags() {
  console.log('\n🚩 Generating feature flags docs...');

  const featFile = join(ROOT, 'backend', 'src', 'shared', 'features.ts');
  if (!existsSync(featFile)) { console.log('  features.ts not found — skipping'); return; }

  const src = readFileSync(featFile, 'utf8');

  // Extract flag() calls: flag('ENV_NAME', defaultValue)
  const flags = [];
  const re = /(\w+):\s*flag\('([^']+)',\s*(true|false)\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    flags.push({ key: m[1], env: m[2], defaultVal: m[3] });
  }

  // Also extract aiProvider line
  const providerMatch = src.match(/aiProvider:.*?process\.env\.(\w+).*?'([^']+)'/);

  let out = `> ⚡ Авто-сгенерировано из \`backend/src/shared/features.ts\`
> Управление через переменные окружения в \`.env\`.

| Флаг | Env-переменная | По умолчанию | Описание |
|------|---------------|-------------|----------|
`;
  const DESCRIPTIONS = {
    ai: 'AI-оценка задач и декомпозиция',
    mcp: 'MCP-прокси для Claude Desktop',
    gitlab: 'GitLab webhook интеграция',
    telegram: 'Telegram-бот уведомления',
  };
  for (const f of flags) {
    out += `| \`${f.key}\` | \`${f.env}\` | \`${f.defaultVal}\` | ${DESCRIPTIONS[f.key] ?? ''} |\n`;
  }
  if (providerMatch) {
    out += `| \`aiProvider\` | \`${providerMatch[1]}\` | \`${providerMatch[2]}\` | AI провайдер: \`anthropic\` или \`heuristic\` |\n`;
  }

  const outFile = join(ROOT, 'docs', 'architecture', 'overview.md');
  injectAutoSection(outFile, out, 'features');
  console.log(`  ✓ Updated docs/architecture/overview.md — feature flags (${flags.length} flags)`);
}

// ── ENV VARS → docs/guides/getting-started.md ────────────────────────────────

function generateEnvVars() {
  console.log('\n🔐 Generating env vars docs...');

  const backendEnv  = join(ROOT, 'backend', '.env.example');
  const frontendEnv = join(ROOT, 'frontend', '.env.example');
  if (!existsSync(backendEnv)) { console.log('  backend/.env.example not found — skipping'); return; }

  function parseEnvFile(filePath) {
    const lines = readFileSync(filePath, 'utf8').split('\n');
    const result = [];
    let currentComment = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) {
        currentComment = trimmed.replace(/^#+\s*/, '');
      } else if (trimmed && trimmed.includes('=')) {
        const eqIdx = trimmed.indexOf('=');
        const key = trimmed.slice(0, eqIdx).replace(/^#\s*/, '');
        const val = trimmed.slice(eqIdx + 1).replace(/^["']|["']$/g, '');
        const optional = line.trimStart().startsWith('#') && !key.startsWith('DATABASE');
        result.push({ key, val, comment: currentComment, optional });
        currentComment = '';
      } else {
        currentComment = '';
      }
    }
    return result;
  }

  const backendVars  = parseEnvFile(backendEnv);
  const frontendVars = existsSync(frontendEnv) ? parseEnvFile(frontendEnv) : [];

  let out = `> ⚡ Авто-сгенерировано из \`backend/.env.example\` и \`frontend/.env.example\`
> Скопируй файлы и заполни нужные значения: \`cp backend/.env.example backend/.env\`

### Backend (\`backend/.env\`)

| Переменная | Пример | Описание |
|-----------|--------|----------|
`;
  for (const v of backendVars) {
    const displayVal = v.val.length > 40 ? v.val.slice(0, 37) + '...' : v.val;
    out += `| \`${v.key}\` | \`${displayVal || '—'}\` | ${v.comment || ''} |\n`;
  }

  if (frontendVars.length > 0) {
    out += `\n### Frontend (\`frontend/.env\`)\n\n| Переменная | Значение | Описание |\n|-----------|---------|----------|\n`;
    for (const v of frontendVars) {
      out += `| \`${v.key}\` | \`${v.val || '—'}\` | ${v.comment || ''} |\n`;
    }
  }

  const outFile = join(ROOT, 'docs', 'guides', 'getting-started.md');
  injectAutoSection(outFile, out, 'env');
  console.log(`  ✓ Updated docs/guides/getting-started.md — env vars (${backendVars.length} backend, ${frontendVars.length} frontend)`);
}

// ── ZUSTAND STORES → docs/architecture/frontend-architecture.md ──────────────

function generateStores() {
  console.log('\n🗃️  Generating Zustand stores docs...');

  const storeDir = join(ROOT, 'frontend', 'src', 'store');
  if (!existsSync(storeDir)) { console.log('  frontend/src/store not found — skipping'); return; }

  const files = readdirSync(storeDir).filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
  const stores = [];

  for (const file of files) {
    const src = readFileSync(join(storeDir, file), 'utf8');
    const storeName = file.replace(/\.tsx?$/, '');

    // Extract interface fields (state + actions)
    const stateFields = [];
    const interfaceRe = /interface\s+\w+State\s*\{([^}]+)\}/s;
    const ifaceMatch = src.match(interfaceRe);
    if (ifaceMatch) {
      const body = ifaceMatch[1];
      for (const line of body.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//')) continue;
        const fieldMatch = trimmed.match(/^(\w+)(\??)\s*:\s*(.+?);?\s*$/);
        if (fieldMatch) {
          const isAction = fieldMatch[3].startsWith('(') || fieldMatch[3].includes('=>');
          stateFields.push({ name: fieldMatch[1], type: fieldMatch[3].replace(/;$/, ''), isAction });
        }
      }
    }

    const stateCount  = stateFields.filter(f => !f.isAction).length;
    const actionCount = stateFields.filter(f => f.isAction).length;
    stores.push({ file, storeName, stateFields, stateCount, actionCount });
  }

  let out = `> ⚡ Авто-сгенерировано из \`frontend/src/store/*.ts\`
> Обновляется при изменении store-файлов.

`;
  for (const s of stores) {
    out += `### \`${s.storeName}\`\n\n`;
    out += `Файл: \`frontend/src/store/${s.file}\` · ${s.stateCount} полей состояния · ${s.actionCount} экшенов\n\n`;
    if (s.stateFields.length > 0) {
      out += '| Поле / Экшен | Тип | Вид |\n|-------------|-----|-----|\n';
      for (const f of s.stateFields) {
        const typeShort = f.type.length > 60 ? f.type.slice(0, 57) + '...' : f.type;
        out += `| \`${f.name}\` | \`${typeShort}\` | ${f.isAction ? 'экшен' : 'состояние'} |\n`;
      }
      out += '\n';
    }
  }

  const outFile = join(ROOT, 'docs', 'architecture', 'frontend-architecture.md');
  injectAutoSection(outFile, out, 'stores');
  console.log(`  ✓ Updated docs/architecture/frontend-architecture.md — stores (${stores.length} stores)`);
}

// ── MAKEFILE → docs/guides/getting-started.md ────────────────────────────────

function generateMakefileDoc() {
  console.log('\n🔧 Generating Makefile commands docs...');

  const makeFile = join(ROOT, 'Makefile');
  if (!existsSync(makeFile)) { console.log('  Makefile not found — skipping'); return; }

  const src = readFileSync(makeFile, 'utf8');
  const lines = src.split('\n');
  const targets = [];
  let pendingComment = '';

  // Extract section headings and targets
  let currentSection = 'General';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Section comment (# --- Foo ---)
    const sectionMatch = line.match(/^#\s*---+\s*(.+?)\s*---+/);
    if (sectionMatch) { currentSection = sectionMatch[1]; continue; }

    // Inline comment
    if (line.match(/^#\s+.+/) && !line.includes('---')) {
      pendingComment = line.replace(/^#+\s*/, '').trim();
      continue;
    }

    // Target: name: [deps]
    const targetMatch = line.match(/^([a-z][a-z0-9-]*)\s*:/);
    if (targetMatch) {
      const name = targetMatch[1];
      // Skip internal-ish targets
      if (['all', '.PHONY', 'MAKEFLAGS'].includes(name)) { pendingComment = ''; continue; }

      // Look for @echo on next line as description
      let desc = pendingComment;
      if (!desc && i + 1 < lines.length) {
        const echoMatch = lines[i + 1].match(/@echo\s+"?(.+?)"?\s*$/);
        if (echoMatch) desc = echoMatch[1];
      }

      targets.push({ name, section: currentSection, desc: desc || '' });
      pendingComment = '';
    } else {
      pendingComment = '';
    }
  }

  // Group by section
  const sections = {};
  for (const t of targets) {
    if (!sections[t.section]) sections[t.section] = [];
    sections[t.section].push(t);
  }

  let out = `> ⚡ Авто-сгенерировано из \`Makefile\`. Запуск: \`make <команда>\`

`;
  for (const [section, cmds] of Object.entries(sections)) {
    out += `**${section}**\n\n| Команда | Описание |\n|---------|----------|\n`;
    for (const c of cmds) {
      out += `| \`make ${c.name}\` | ${c.desc} |\n`;
    }
    out += '\n';
  }

  const outFile = join(ROOT, 'docs', 'guides', 'getting-started.md');
  injectAutoSection(outFile, out, 'makefile');
  console.log(`  ✓ Updated docs/guides/getting-started.md — make targets (${targets.length} targets)`);
}

// ── DOCKER SERVICES → docs/guides/getting-started.md ─────────────────────────

function generateDockerDoc() {
  console.log('\n🐳 Generating Docker services docs...');

  const composeFile = join(ROOT, 'docker-compose.yml');
  if (!existsSync(composeFile)) { console.log('  docker-compose.yml not found — skipping'); return; }

  const src = readFileSync(composeFile, 'utf8');
  const services = [];

  // Split into lines, find service blocks by indentation pattern
  const lines = src.split('\n');
  let inServicesSection = false;
  let currentService = null;

  for (const line of lines) {
    if (line.startsWith('services:')) { inServicesSection = true; continue; }
    if (inServicesSection && /^(volumes|networks):/.test(line)) { inServicesSection = false; break; }
    if (!inServicesSection) continue;

    // Top-level service name (2-space indent, ends with colon)
    const serviceMatch = line.match(/^  (\w[\w-]*):\s*$/);
    if (serviceMatch) {
      if (currentService) services.push(currentService);
      currentService = { name: serviceMatch[1], image: '—', ports: [], profiles: [] };
      continue;
    }

    if (!currentService) continue;

    const imageMatch   = line.match(/^\s+image:\s*(.+)/);
    const portMatch    = line.match(/^\s+-\s+["']?(\d+:\d+)["']?/);
    const profileMatch = line.match(/^\s+-\s+(\w[\w-]*)/) ;

    if (imageMatch) currentService.image = imageMatch[1].trim();
    // ports only under ports: key (heuristic: contains colon between digits)
    if (portMatch && /\d+:\d+/.test(portMatch[1])) currentService.ports.push(portMatch[1]);
    // profiles: look for lines after 'profiles:' that are plain words without colons
    if (profileMatch && !line.includes(':') && line.match(/^\s{6}-/)) {
      currentService.profiles.push(profileMatch[1]);
    }
  }
  if (currentService) services.push(currentService);

  let out = `> ⚡ Авто-сгенерировано из \`docker-compose.yml\`
> Запуск: \`make infra\` (только БД+Redis) или \`docker compose up -d\` (все сервисы)

| Сервис | Image | Порты | Профиль |
|--------|-------|-------|---------|
`;
  for (const s of services) {
    out += `| \`${s.name}\` | \`${s.image}\` | ${s.ports.join(', ') || '—'} | ${s.profiles.join(', ') || 'default'} |\n`;
  }

  const outFile = join(ROOT, 'docs', 'guides', 'getting-started.md');
  injectAutoSection(outFile, out, 'docker');
  console.log(`  ✓ Updated docs/guides/getting-started.md — docker services (${services.length} services)`);
}

// ── STALENESS CHECK ───────────────────────────────────────────────────────────

// Files that CAN'T be auto-generated → need developer reminders
const REMINDER_MAPPING = [
  { pattern: /frontend\/src\/pages\//, doc: 'docs/user-manual/features/', hint: 'UI page changed — update user manual' },
  { pattern: /frontend\/src\/components\//, doc: 'docs/design-system/overview.md', hint: 'UI components changed — update design system docs' },
  { pattern: /deploy\//, doc: 'docs/guides/deployment.md', hint: 'Deployment config changed — update deployment guide' },
  { pattern: /\.github\/workflows\//, doc: 'docs/guides/deployment.md', hint: 'CI/CD workflows changed — update deployment guide' },
  { pattern: /backend\/src\/modules\/integrations\//, doc: 'docs/integrations/', hint: 'Integration code changed — update integration docs' },
];

function checkStale() {
  console.log('\n🔍 Checking for docs that need manual updates...');

  let changedFiles;
  try {
    changedFiles = run('git diff --name-only HEAD~1 HEAD').split('\n').filter(Boolean);
  } catch {
    changedFiles = run('git diff --cached --name-only').split('\n').filter(Boolean);
  }

  const warnings = [];
  for (const file of changedFiles) {
    for (const mapping of REMINDER_MAPPING) {
      if (mapping.pattern.test(file)) {
        warnings.push(`  ⚠️  ${mapping.hint}\n     Source: ${file}\n     Update: ${mapping.doc}`);
      }
    }
  }

  if (warnings.length === 0) {
    console.log('  ✓ No manual doc updates needed');
  } else {
    console.log('\n  Требуется ручное обновление документации:\n');
    for (const w of warnings) console.log(w);
    console.log('');
  }

  return warnings.length;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const all = args.includes('--all') || args.length === 0;

const runChangelog = all || args.includes('--changelog');
const runRoutes    = all || args.includes('--routes');
const runSchema    = all || args.includes('--schema');
const runModules   = all || args.includes('--modules');
const runFrontend  = all || args.includes('--frontend');
const runFeatures  = all || args.includes('--features');
const runEnv       = all || args.includes('--env');
const runStores    = all || args.includes('--stores');
const runMakefile  = all || args.includes('--makefile');
const runDocker    = all || args.includes('--docker');
const runStale     = all || args.includes('--stale');

console.log('Flow Universe Documentation Generator');
console.log('======================================');

if (runChangelog) updateChangelog();
if (runRoutes)    generateApiRef();
if (runSchema)    generateSchemaDoc();
if (runModules)   generateModulesDoc();
if (runFrontend)  generateFrontendRoutes();
if (runFeatures)  generateFeatureFlags();
if (runEnv)       generateEnvVars();
if (runStores)    generateStores();
if (runMakefile)  generateMakefileDoc();
if (runDocker)    generateDockerDoc();

if (runStale) {
  const staleCount = checkStale();
  if (staleCount > 0 && process.env.CI) process.exitCode = 0; // warn, don't fail
}

console.log('\n✅ Done\n');

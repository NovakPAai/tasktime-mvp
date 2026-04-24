// TTBULK-1 PR-12 — k6 load test для массовых операций.
//
// Цель: 100 параллельных юзеров × 100 items scope → p95 < 60s end-to-end
// (preview → create → finalize).
//
// Не входит в обычный CI (manual load test для pre-cutover validation).
// Run: k6 run -e E2E_API_BASE_URL=http://localhost:3002/api \
//             -e E2E_AUTH_TOKEN=<jwt> \
//             backend/tests/bulk-operations-load.k6.js
//
// См. docs/tz/TTBULK-1.md §10.4, §13.7 PR-12.

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    bulk_ops_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },   // warmup
        { duration: '2m', target: 100 },   // 100 VUs steady
        { duration: '30s', target: 0 },    // rampdown
      ],
      gracefulStop: '2m',
    },
  },
  thresholds: {
    // p95 на полный цикл (preview+create) — не более 5s (finalize async через processor).
    http_req_duration: ['p(95)<5000'],
    // 0 failed requests допустимо (429 TOO_MANY_CONCURRENT — ожидаемый path,
    // k6 стрессует concurrency-quota; проверяется отдельно).
    http_req_failed: ['rate<0.05'],
  },
};

const API_BASE = __ENV.E2E_API_BASE_URL || 'http://localhost:3002/api';
const TOKEN = __ENV.E2E_AUTH_TOKEN || '';
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

// Pre-generated issue-ids для scope=ids (100 items на VU). Tester должен
// заполнить через `tests/fixtures/search-seed-100k.ts` + взять первые 10k UUID.
const ISSUE_IDS = (__ENV.E2E_ISSUE_IDS || '').split(',').filter(Boolean);

export default function () {
  if (ISSUE_IDS.length < 100) {
    throw new Error(
      'E2E_ISSUE_IDS должен содержать минимум 100 UUID-ов (comma-separated). ' +
      'Seed через `backend/tests/fixtures/search-seed-100k.ts`.'
    );
  }

  // Random 100-slice из pool'а.
  const startIdx = Math.floor(Math.random() * (ISSUE_IDS.length - 100));
  const scope = ISSUE_IDS.slice(startIdx, startIdx + 100);

  // Preview
  const previewRes = http.post(
    `${API_BASE}/bulk-operations/preview`,
    JSON.stringify({
      scope: { kind: 'ids', issueIds: scope },
      payload: { type: 'ADD_COMMENT', body: 'k6 load test' },
    }),
    { headers: HEADERS },
  );

  check(previewRes, {
    'preview 200': (r) => r.status === 200,
    'preview has token': (r) => r.json('previewToken') !== null,
  });

  if (previewRes.status !== 200) {
    sleep(1);
    return;
  }

  const previewToken = previewRes.json('previewToken');

  // Create (с unique idempotency-key per VU iteration)
  const idempKey = `k6-${__VU}-${__ITER}-${Date.now()}`;
  const createRes = http.post(
    `${API_BASE}/bulk-operations`,
    JSON.stringify({ previewToken }),
    {
      headers: {
        ...HEADERS,
        'Idempotency-Key': idempKey,
      },
    },
  );

  check(createRes, {
    // 201 create или 200 replay или 429 quota — все ожидаемые.
    'create 200/201/429': (r) => [200, 201, 429].includes(r.status),
    'create has id': (r) => r.status >= 400 || r.json('id') !== null,
  });

  sleep(Math.random() * 2); // jitter
}

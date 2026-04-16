#!/usr/bin/env node
/**
 * AI Code Review Bot
 * Fetches PR diff → sends to OpenAI → posts review comment on the PR.
 *
 * Transfer to another project: copy .github/workflows/ai-review.yml
 * and .github/scripts/ai-review.mjs, then add OPENAI_API_KEY secret.
 *
 * Config via GitHub Repository Variables (Settings → Variables → Actions):
 *   AI_REVIEW_MODEL        gpt-4o-mini (default) | gpt-4o | gpt-4-turbo
 *   AI_REVIEW_LANGUAGE     Russian (default) | English
 *   AI_REVIEW_MAX_CHARS    80000 (default) — max diff chars sent to LLM
 *   AI_REVIEW_FAIL_ON_CRITICAL  false (default) — fail CI on critical issues
 */

const {
  GITHUB_TOKEN,
  OPENAI_API_KEY,
  PR_NUMBER,
  REPO_OWNER,
  REPO_NAME,
  PR_TITLE = '',
  PR_BODY = '',
  AI_MODEL = 'gpt-4o-mini',
  REVIEW_LANGUAGE = 'Russian',
  MAX_DIFF_CHARS = '80000',
  FAIL_ON_CRITICAL = 'false',
} = process.env;

// ---------------------------------------------------------------------------
// Files to skip — lock files, generated code, migrations, build artifacts
// ---------------------------------------------------------------------------
const IGNORE_PATTERNS = [
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /\.lock$/,
  /dist\//,
  /build\//,
  /\.min\.(js|css)$/,
  /migrations?\//,
  /migration\.sql$/,
  /\.generated\./,
  /__generated__/,
  /\.snap$/,
  /public\/assets\//,
];

function shouldIgnore(filePath) {
  return IGNORE_PATTERNS.some((re) => re.test(filePath));
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------
async function githubFetch(path, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

async function fetchPRDiff() {
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${PR_NUMBER}`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3.diff',
      },
    }
  );
  if (!res.ok) throw new Error(`Failed to fetch diff: ${res.status}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Diff preprocessing
// ---------------------------------------------------------------------------
function filterAndTruncateDiff(rawDiff, maxChars) {
  const sections = rawDiff.split(/(?=diff --git )/);

  const kept = sections.filter((section) => {
    const m = section.match(/diff --git a\/(.+?) b\//);
    return m ? !shouldIgnore(m[1]) : false;
  });

  let result = kept.join('');
  if (result.length > maxChars) {
    result =
      result.slice(0, maxChars) +
      '\n\n[... diff truncated — increase AI_REVIEW_MAX_CHARS to see more ...]';
  }
  return result;
}

// ---------------------------------------------------------------------------
// OpenAI review
// ---------------------------------------------------------------------------
async function reviewWithOpenAI(diff) {
  const systemPrompt = `You are a senior software engineer doing a thorough code review.
Analyze the provided git diff and return a JSON object with this exact structure:
{
  "summary": "2-3 sentence overview of what changed and overall quality",
  "verdict": "approve" | "request_changes" | "comment",
  "issues": [
    {
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "file": "path/to/file.ts",
      "line": 42,
      "title": "Short issue title (max 80 chars)",
      "description": "Clear explanation of the problem",
      "suggestion": "Concrete fix or improvement"
    }
  ],
  "positives": ["Notable good practices or clean code found"]
}

Severity guide:
  critical — security vulnerability, data loss, crash, broken auth
  high     — logic bug, missing error handling, potential data corruption
  medium   — performance issue, maintainability problem, incomplete handling
  low      — style, naming, minor improvement
  info     — optional suggestion, best practice

Rules:
- Write ALL text fields in ${REVIEW_LANGUAGE}.
- Return ONLY valid JSON, no markdown code fences.
- Skip trivial style issues unless they're systematic.
- For "line", use the NEW file line number from the diff (+lines). Use null if not applicable.
- Verdict: "approve" if no critical/high issues; "request_changes" if critical/high exist; "comment" otherwise.`;

  const userPrompt = `PR: ${PR_TITLE}${PR_BODY ? `\nDescription: ${PR_BODY}` : ''}

\`\`\`diff
${diff}
\`\`\``;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const { usage } = data;

  // Cost estimate (gpt-4o-mini: $0.15/1M in, $0.60/1M out)
  const costIn = (usage.prompt_tokens / 1_000_000) * 0.15;
  const costOut = (usage.completion_tokens / 1_000_000) * 0.60;
  console.log(
    `Tokens: ${usage.prompt_tokens} in + ${usage.completion_tokens} out` +
    ` ≈ $${(costIn + costOut).toFixed(4)}`
  );

  return JSON.parse(data.choices[0].message.content);
}

// ---------------------------------------------------------------------------
// Format GitHub comment
// ---------------------------------------------------------------------------
const SEVERITY_EMOJI = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
  info: '⚪',
};

const VERDICT_EMOJI = {
  approve: '✅',
  request_changes: '❌',
  comment: '💬',
};

function formatComment(review) {
  const counts = {};
  for (const issue of review.issues ?? []) {
    counts[issue.severity] = (counts[issue.severity] ?? 0) + 1;
  }

  const statLine = ['critical', 'high', 'medium', 'low', 'info']
    .filter((s) => counts[s])
    .map((s) => `${SEVERITY_EMOJI[s]} ${counts[s]} ${s}`)
    .join(' · ');

  let md = `## ${VERDICT_EMOJI[review.verdict] ?? '💬'} AI Code Review\n\n`;
  md += `${review.summary}\n\n`;

  if (statLine) md += `**Issues:** ${statLine}\n\n`;

  // Issues grouped by severity
  if (review.issues?.length > 0) {
    md += `### Issues\n\n`;
    for (const sev of ['critical', 'high', 'medium', 'low', 'info']) {
      const issues = review.issues.filter((i) => i.severity === sev);
      for (const issue of issues) {
        const location = issue.line
          ? `\`${issue.file}:${issue.line}\``
          : `\`${issue.file}\``;
        md += `<details>\n`;
        md += `<summary>${SEVERITY_EMOJI[sev]} <strong>${issue.title}</strong> — ${location}</summary>\n\n`;
        md += `${issue.description}\n\n`;
        if (issue.suggestion) {
          md += `**Suggestion:** ${issue.suggestion}\n`;
        }
        md += `\n</details>\n\n`;
      }
    }
  }

  // Positives
  if (review.positives?.length > 0) {
    md += `### What's good\n\n`;
    for (const p of review.positives) md += `- ${p}\n`;
    md += '\n';
  }

  md += `---\n*AI Code Review · ${AI_MODEL} · [Configure](.github/workflows/ai-review.yml)*`;
  return md;
}

// ---------------------------------------------------------------------------
// Post comment (replace previous bot comment to avoid spam)
// ---------------------------------------------------------------------------
const BOT_MARKER = 'AI Code Review ·';

async function postComment(body) {
  const existing = await githubFetch(
    `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${PR_NUMBER}/comments`
  );

  for (const c of existing) {
    if (c.body?.includes(BOT_MARKER)) {
      await githubFetch(
        `/repos/${REPO_OWNER}/${REPO_NAME}/issues/comments/${c.id}`,
        { method: 'DELETE' }
      );
      console.log(`Deleted previous review comment #${c.id}`);
    }
  }

  await githubFetch(
    `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${PR_NUMBER}/comments`,
    { method: 'POST', body: JSON.stringify({ body }) }
  );
  console.log('Review comment posted.');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!OPENAI_API_KEY) throw new Error('Secret OPENAI_API_KEY is not set in repo settings');
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is missing');

  console.log(`Reviewing PR #${PR_NUMBER} (${REPO_OWNER}/${REPO_NAME}) with ${AI_MODEL}`);

  const rawDiff = await fetchPRDiff();
  const diff = filterAndTruncateDiff(rawDiff, parseInt(MAX_DIFF_CHARS, 10));

  if (!diff.trim()) {
    console.log('No reviewable changes (all files matched ignore list).');
    return;
  }

  console.log(`Diff: ${diff.length} chars`);

  const review = await reviewWithOpenAI(diff);
  const comment = formatComment(review);

  await postComment(comment);

  const hasCritical = review.issues?.some((i) => i.severity === 'critical');
  console.log(`Done. Verdict: ${review.verdict} | Issues: ${review.issues?.length ?? 0}`);

  if (FAIL_ON_CRITICAL === 'true' && hasCritical) {
    console.error('Critical issues found — failing the check (FAIL_ON_CRITICAL=true)');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('AI Review failed:', err.message);
  process.exit(1);
});

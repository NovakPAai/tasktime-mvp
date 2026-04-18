#!/usr/bin/env node
/**
 * AI Code Review Bot
 * Fetches PR diff → sends to OpenAI → posts review comment on the PR.
 *
 * Transfer to another project: copy .github/workflows/ai-review.yml
 * and .github/scripts/ai-review.mjs, then add OPENAI_API_KEY secret.
 *
 * Config via GitHub Repository Variables (Settings → Variables → Actions):
 *   AI_REVIEW_MODEL        gpt-5.4 (default) | gpt-4o | gpt-4o-mini
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
  FAIL_ON_CRITICAL = 'true',
  APPROVE_ON_CLEAN = 'true',
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
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub ${path}: ${res.status} ${body.slice(0, 500)}`);
  }
  if (!body || res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return body;
  try {
    return JSON.parse(body);
  } catch (e) {
    throw new Error(`GitHub ${path}: non-JSON response: ${e.message} — body: ${body.slice(0, 200)}`);
  }
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
async function reviewWithOpenAI(diff, prTitle = PR_TITLE, prBody = PR_BODY, previousReview = null) {
  const isFollowUp = !!previousReview;

  const systemPrompt = isFollowUp
    ? `You are a senior software engineer doing a FOLLOW-UP code review after the author addressed your previous feedback.

The diff you receive is the FULL cumulative PR diff (base → HEAD), not just the latest commit.

Return a JSON object with this exact structure:
{
  "summary": "2-3 sentence overview of what was fixed and remaining state",
  "verdict": "approve" | "request_changes" | "comment",
  "resolved": ["Short description of each issue from previous review that is now fixed"],
  "issues": [
    {
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "file": "path/to/file.ts",
      "line": 42,
      "title": "Short issue title (max 80 chars)",
      "description": "Clear explanation of the problem",
      "suggestion": "Concrete fix or improvement",
      "isNew": true
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

CRITICAL rules to prevent review loops:
- DO NOT re-raise issues from the previous review that are now fixed or reasonably addressed.
- DO NOT raise new medium/low/info issues about code introduced specifically to fix a previous issue — if the fix is reasonable, accept it.
- ONLY raise issues that are: (a) still unresolved from previous review, OR (b) genuinely new problems introduced by the latest commits.
- Be conservative on follow-up reviews: prefer "approve" over "request_changes" unless something is truly critical or high severity.
- If an issue from previous review is partially addressed (improved but not perfect), mark it resolved and leave a positive note instead of blocking again.
- Do NOT mention version_history.md — it was already noted in the previous review, no need to repeat.
- Write ALL text fields in ${REVIEW_LANGUAGE}.
- Return ONLY valid JSON, no markdown code fences.
- For "line", use the NEW file line number from the diff (+lines). Use null if not applicable.
- Verdict: "approve" if no unresolved critical/high issues; "request_changes" only if critical/high issues remain or newly appeared; "comment" otherwise.`
    : `You are a senior software engineer doing a thorough code review.
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
- Verdict: "approve" if no critical/high issues; "request_changes" if critical/high exist; "comment" otherwise.
- If version_history.md was not updated in this PR, mention it ONCE as a single brief info-level issue (one sentence). Do not elaborate.`;

  const previousReviewSection = isFollowUp
    ? `\n\nPREVIOUS REVIEW JSON (structured — use this to track what was flagged and what is now resolved):\n${JSON.stringify(previousReview, null, 2)}\n\n---\n`
    : '';

  const userPrompt = `PR: ${prTitle}${prBody ? `\nDescription: ${prBody}` : ''}${previousReviewSection}

Current full PR diff (base → HEAD):
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

  const rawBody = await res.text();

  if (!res.ok) {
    throw new Error(`OpenAI error: ${res.status} ${rawBody.slice(0, 200)}`);
  }

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(`OpenAI returned unexpected content-type: ${ct} — body: ${rawBody.slice(0, 200)}`);
  }

  let data;
  try {
    data = JSON.parse(rawBody);
  } catch (e) {
    console.error(`Raw OpenAI response body (first 500 chars):\n${rawBody.slice(0, 500)}`);
    throw new Error(`OpenAI returned non-JSON body: ${e.message}`);
  }

  const { usage } = data;

  // Cost estimate — gpt-5.4: $7/1M in, $21/1M out (update when official pricing is published)
  const COST_IN  = AI_MODEL.startsWith('gpt-5') ? 7.00 : AI_MODEL === 'gpt-4o' ? 2.50 : 0.15;
  const COST_OUT = AI_MODEL.startsWith('gpt-5') ? 21.00 : AI_MODEL === 'gpt-4o' ? 10.00 : 0.60;
  const costIn  = (usage.prompt_tokens  / 1_000_000) * COST_IN;
  const costOut = (usage.completion_tokens / 1_000_000) * COST_OUT;
  console.log(
    `Tokens: ${usage.prompt_tokens} in + ${usage.completion_tokens} out` +
    ` ≈ $${(costIn + costOut).toFixed(4)}`
  );

  const rawContent = data.choices?.[0]?.message?.content;

  if (!rawContent) {
    const finishReason = data.choices?.[0]?.finish_reason ?? 'unknown';
    console.error(`Raw API response: ${JSON.stringify(data)}`);
    throw new Error(`Model returned empty content (finish_reason: ${finishReason})`);
  }

  // Strip markdown code fences — some models wrap JSON in ```json ... ``` despite instructions
  const cleaned = rawContent
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error(`Raw model content:\n${rawContent}`);
    throw new Error(`Failed to parse model response as JSON: ${e.message}`);
  }
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

function formatComment(review, isFollowUp = false) {
  const counts = {};
  for (const issue of review.issues ?? []) {
    counts[issue.severity] = (counts[issue.severity] ?? 0) + 1;
  }

  const statLine = ['critical', 'high', 'medium', 'low', 'info']
    .filter((s) => counts[s])
    .map((s) => `${SEVERITY_EMOJI[s]} ${counts[s]} ${s}`)
    .join(' · ');

  const iteration = isFollowUp ? ' (follow-up)' : '';
  let md = `## ${VERDICT_EMOJI[review.verdict] ?? '💬'} AI Code Review${iteration}\n\n`;
  md += `${review.summary}\n\n`;

  // Resolved issues from previous review
  if (review.resolved?.length > 0) {
    md += `### ✅ Resolved from previous review\n\n`;
    for (const r of review.resolved) md += `- ${r}\n`;
    md += '\n';
  }

  if (statLine) md += `**Remaining issues:** ${statLine}\n\n`;

  // Issues grouped by severity
  if (review.issues?.length > 0) {
    md += `### Issues\n\n`;
    for (const sev of ['critical', 'high', 'medium', 'low', 'info']) {
      const issues = review.issues.filter((i) => i.severity === sev);
      for (const issue of issues) {
        const location = issue.line
          ? `\`${issue.file}:${issue.line}\``
          : `\`${issue.file}\``;
        const newBadge = issue.isNew ? ' 🆕' : '';
        md += `<details>\n`;
        md += `<summary>${SEVERITY_EMOJI[sev]} <strong>${issue.title}</strong>${newBadge} — ${location}</summary>\n\n`;
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

const JSON_MARKER = '<!-- ai-review-json:';
const JSON_MARKER_END = '-->';

function embedReviewJson(comment, review) {
  return `${comment}\n${JSON_MARKER}${JSON.stringify(review)}${JSON_MARKER_END}`;
}

function extractReviewJson(commentBody) {
  if (!commentBody) return null;
  const start = commentBody.indexOf(JSON_MARKER);
  if (start === -1) return null;
  const jsonStart = start + JSON_MARKER.length;
  const end = commentBody.indexOf(JSON_MARKER_END, jsonStart);
  if (end === -1) return null;
  try {
    return JSON.parse(commentBody.slice(jsonStart, end));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Post comment (replace previous bot comment to avoid spam)
// ---------------------------------------------------------------------------
const BOT_MARKER = 'AI Code Review ·';

function findLastBotComment(comments) {
  return comments
    .filter((c) => c.body?.includes(BOT_MARKER))
    .sort((a, b) => b.id - a.id)[0] ?? null;
}

async function postComment(body) {
  const existing = await githubFetch(
    `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${PR_NUMBER}/comments`
  );

  const botComment = findLastBotComment(existing ?? []);

  if (botComment) {
    await githubFetch(
      `/repos/${REPO_OWNER}/${REPO_NAME}/issues/comments/${botComment.id}`,
      { method: 'PATCH', body: JSON.stringify({ body }) }
    );
    console.log(`Updated existing review comment #${botComment.id}`);
  } else {
    await githubFetch(
      `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${PR_NUMBER}/comments`,
      { method: 'POST', body: JSON.stringify({ body }) }
    );
    console.log('Review comment posted.');
  }
}

async function submitReview(body, verdict, commitId) {
  const eventMap = {
    approve: 'APPROVE',
    request_changes: 'REQUEST_CHANGES',
    comment: 'COMMENT',
  };
  const event = eventMap[verdict] ?? 'COMMENT';

  // APPROVE body must include 'AI-APPROVED' for the gate job in build-and-publish.yml to recognise it
  const reviewBody = event === 'APPROVE'
    ? `${body}\n\n<!-- AI-APPROVED -->`
    : body;

  await githubFetch(
    `/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${PR_NUMBER}/reviews`,
    {
      method: 'POST',
      body: JSON.stringify({ commit_id: commitId, event, body: reviewBody }),
    }
  );
  console.log(`Submitted formal review: ${event}`);
}

async function fetchPreviousReview() {
  const existing = await githubFetch(
    `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${PR_NUMBER}/comments`
  );
  const botComment = findLastBotComment(existing ?? []);
  if (!botComment) return null;
  return extractReviewJson(botComment.body);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function fetchPRMeta() {
  const pr = await githubFetch(
    `/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${PR_NUMBER}`
  );
  return { title: pr.title ?? '', body: pr.body ?? '' };
}

async function main() {
  if (!OPENAI_API_KEY) throw new Error('Secret OPENAI_API_KEY is not set in repo settings');
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is missing');

  // workflow_dispatch doesn't populate PR_TITLE/PR_BODY — fetch from API
  let prTitle = PR_TITLE;
  let prBody = PR_BODY;
  if (!prTitle) {
    console.log('PR_TITLE empty (manual dispatch) — fetching PR metadata from API');
    const meta = await fetchPRMeta();
    prTitle = meta.title;
    prBody = meta.body;
  }

  console.log(`Reviewing PR #${PR_NUMBER} (${REPO_OWNER}/${REPO_NAME}) with ${AI_MODEL}`);

  // Fetch previous review BEFORE posting (to pass as context to GPT)
  const previousReview = await fetchPreviousReview();
  const isFollowUp = !!previousReview;
  if (isFollowUp) {
    console.log('Previous review found — running follow-up review with context.');
  }

  const rawDiff = await fetchPRDiff();
  const diff = filterAndTruncateDiff(rawDiff, parseInt(MAX_DIFF_CHARS, 10));

  if (!diff.trim()) {
    console.log('No reviewable changes (all files matched ignore list).');
    return;
  }

  console.log(`Diff: ${diff.length} chars`);

  const review = await reviewWithOpenAI(diff, prTitle, prBody, previousReview);
  const commentBody = embedReviewJson(formatComment(review, isFollowUp), review);

  const hasCritical = review.issues?.some((i) => i.severity === 'critical');
  const hasHigh = review.issues?.some((i) => i.severity === 'high');
  console.log(`Done. Verdict: ${review.verdict} | Issues: ${review.issues?.length ?? 0} | Follow-up: ${isFollowUp}`);

  if (APPROVE_ON_CLEAN === 'true') {
    // Formal PR review — APPROVE or REQUEST_CHANGES (gate-compatible)
    const { head } = await githubFetch(`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${PR_NUMBER}`);
    await submitReview(commentBody, review.verdict, head.sha);
  } else {
    // Legacy: comment-only mode
    await postComment(commentBody);
  }

  if (FAIL_ON_CRITICAL === 'true' && (hasCritical || hasHigh)) {
    console.error('Critical/high issues found — failing the check (FAIL_ON_CRITICAL=true)');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('AI Review failed:', err.message);
  process.exit(1);
});

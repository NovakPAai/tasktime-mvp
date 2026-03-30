import type { PostFunctionRule } from '../types.js';

export async function runWebhookPostFunction(
  issueId: string,
  rule: Extract<PostFunctionRule, { type: 'TRIGGER_WEBHOOK' }>,
  issueData?: unknown,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const body = rule.includeIssue && issueData
      ? JSON.stringify({ issueId, issue: issueData })
      : JSON.stringify({ issueId });

    await fetch(rule.url, {
      method: rule.method ?? 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: rule.method !== 'GET' ? body : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

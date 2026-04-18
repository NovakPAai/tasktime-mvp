// TTMP-160 PR-8 / FR-17: CHECKPOINT_WEBHOOK post-function with anti-flap debounce.
//
// When a ReleaseCheckpoint transitions into VIOLATED state, we optionally POST to the
// webhook URL configured on the underlying CheckpointType. To prevent "flapping"
// (OK → VIOLATED → OK → VIOLATED in quick succession) from spamming downstream Slack /
// Telegram integrations, we debounce by `minStableSeconds` using the `lastWebhookSentAt`
// column — if the last webhook was sent recently, skip.
//
// Errors are logged and swallowed so recompute never fails because of a flaky webhook.

import type { CheckpointState, ReleaseCheckpoint } from '@prisma/client';
import { prisma } from '../../../prisma/client.js';
import { config } from '../../../config.js';

export interface CheckpointWebhookInput {
  releaseCheckpointId: string;
  priorState: CheckpointState;
  newState: CheckpointState;
  checkpointTypeId: string;
}

interface WebhookPayload {
  event: 'checkpoint.violated';
  checkpoint: {
    id: string;
    name: string;
    weight: string;
    deadline: string;
    color: string;
  };
  release: {
    id: string;
    name: string;
    projectKey: string | null;
  };
  violations: Array<{
    issueId: string;
    issueKey: string;
    issueTitle: string;
    reason: string;
  }>;
  transitionedAt: string;
}

// Module-level concurrency cap: if a scheduler tick causes many simultaneous transitions
// into VIOLATED, we don't want hundreds of pending HTTP calls piling up against a slow
// downstream (Slack / Zapier). When the cap is hit we log and skip — the next tick will
// reach the row again if it's still violating.
let _inflightWebhooks = 0;
const MAX_INFLIGHT_WEBHOOKS = 20;

/**
 * Fire the webhook when a checkpoint newly transitions into VIOLATED. No-op for every
 * other state change. Debounced per `minStableSeconds` configured on the type.
 *
 * The caller (`recomputeForRelease`) invokes this via `void notifyViolation(...)` AFTER
 * the per-row transaction commits, so this function only has to:
 *   - await a DB read to get the webhook config,
 *   - await the HTTP dispatch (swallowing timeouts/5xx),
 *   - await the `lastWebhookSentAt` update.
 * The caller never awaits the outer promise, so a slow webhook can't stall recompute.
 */
export async function notifyViolation(input: CheckpointWebhookInput): Promise<void> {
  if (input.newState !== 'VIOLATED') return;
  if (input.priorState === 'VIOLATED') return; // already-VIOLATED; no new transition

  if (_inflightWebhooks >= MAX_INFLIGHT_WEBHOOKS) {
    console.warn(
      `[checkpoints] webhook queue full (${_inflightWebhooks} in flight), skipping — next recompute will retry`,
    );
    return;
  }
  _inflightWebhooks += 1;
  try {
    const checkpoint = await prisma.releaseCheckpoint.findUnique({
      where: { id: input.releaseCheckpointId },
      select: {
        id: true,
        deadline: true,
        violations: true,
        lastWebhookSentAt: true,
        checkpointType: {
          select: {
            id: true,
            name: true,
            color: true,
            weight: true,
            webhookUrl: true,
            minStableSeconds: true,
          },
        },
        release: {
          select: {
            id: true,
            name: true,
            project: { select: { key: true } },
          },
        },
      },
    });
    if (!checkpoint) return;
    const type = checkpoint.checkpointType;
    if (!type.webhookUrl) return;

    // Debounce: skip if a webhook was sent recently (within minStableSeconds).
    if (checkpoint.lastWebhookSentAt) {
      const elapsedMs = Date.now() - checkpoint.lastWebhookSentAt.getTime();
      if (elapsedMs < type.minStableSeconds * 1000) {
        return;
      }
    }

    const violations = parseViolations(checkpoint.violations);
    const payload: WebhookPayload = {
      event: 'checkpoint.violated',
      checkpoint: {
        id: checkpoint.id,
        name: type.name,
        weight: type.weight,
        deadline: checkpoint.deadline.toISOString().slice(0, 10),
        color: type.color,
      },
      release: {
        id: checkpoint.release.id,
        name: checkpoint.release.name,
        projectKey: checkpoint.release.project?.key ?? null,
      },
      violations,
      transitionedAt: new Date().toISOString(),
    };

    // Fire the HTTP call detached so the caller's transaction commits promptly. Still
    // await the initial fetch setup so we can catch fundamental config errors (bad URL).
    await dispatchWebhook(type.webhookUrl, payload);

    // Mark the last-sent moment only after a successful dispatch.
    await prisma.releaseCheckpoint.update({
      where: { id: checkpoint.id },
      data: { lastWebhookSentAt: new Date() },
    });
  } catch (err) {
    console.error('[checkpoints] webhook dispatch failed', err);
  } finally {
    _inflightWebhooks = Math.max(0, _inflightWebhooks - 1);
  }
}

async function dispatchWebhook(url: string, payload: WebhookPayload): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.CHECKPOINT_WEBHOOK_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(
        `[checkpoints] webhook ${url} returned ${res.status} ${res.statusText}`,
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

function parseViolations(value: ReleaseCheckpoint['violations']): WebhookPayload['violations'] {
  if (!Array.isArray(value)) return [];
  const out: WebhookPayload['violations'] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const obj = entry as Record<string, unknown>;
    out.push({
      issueId: typeof obj.issueId === 'string' ? obj.issueId : '',
      issueKey: typeof obj.issueKey === 'string' ? obj.issueKey : '',
      issueTitle: typeof obj.issueTitle === 'string' ? obj.issueTitle : '',
      reason: typeof obj.reason === 'string' ? obj.reason : '',
    });
  }
  return out;
}

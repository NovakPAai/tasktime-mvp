import { z } from 'zod';
import { Decimal } from '@prisma/client/runtime/library';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { prisma, resolveKey, getAgentUserId, text, errText } from '../context.js';

const AI_HOURLY_RATE_USD = parseFloat(process.env.AI_HOURLY_RATE ?? '50');

export function registerTimeTools(server: McpServer) {
  // ── log_time ──────────────────────────────────────────────────────────────────
  server.tool(
    'log_time',
    'Log agent time on an issue (source=AGENT)',
    {
      key: z.string().describe('Issue key, e.g. TTMP-95'),
      hours: z.number().min(0.05).max(24).describe('Hours spent, e.g. 1.5'),
      note: z.string().optional().describe('Short description of work done'),
      sessionId: z.string().optional().describe('AiSession UUID to link this log to'),
    },
    async ({ key, hours, note, sessionId }) => {
      try {
        const issue = await resolveKey(key);
        const agentUserId = await getAgentUserId();

        await prisma.timeLog.create({
          data: {
            issueId: issue.id,
            userId: agentUserId,
            hours: new Decimal(Math.round(hours * 100) / 100),
            note: note ?? null,
            logDate: new Date(),
            source: 'AGENT',
            agentSessionId: sessionId ?? null,
          },
        });

        return text(`Logged ${hours}h on ${key} (source=AGENT) ✓`);
      } catch (err) {
        return errText(err);
      }
    },
  );

  // ── register_ai_session ───────────────────────────────────────────────────────
  server.tool(
    'register_ai_session',
    'Record an AI session with token/cost metrics. Call at the end of each development session.',
    {
      issues: z
        .array(z.object({ key: z.string(), ratio: z.number().min(0).max(1) }))
        .min(1)
        .describe('Issues to split cost across, ratios should sum to 1'),
      model: z.string().describe('Model ID, e.g. claude-sonnet-4-6'),
      provider: z.string().default('anthropic'),
      tokensInput: z.number().int().min(0),
      tokensOutput: z.number().int().min(0),
      costUSD: z.number().min(0).describe('Total cost in USD'),
      notes: z.string().optional(),
    },
    async ({ issues, model, provider, tokensInput, tokensOutput, costUSD, notes }) => {
      try {
        const agentUserId = await getAgentUserId();

        // Resolve all issue keys
        const resolved = await Promise.all(issues.map(i => resolveKey(i.key)));

        // Normalize ratios in case they don't sum to exactly 1
        const totalRatio = issues.reduce((s, i) => s + i.ratio, 0);
        const safeTotalRatio = totalRatio > 0 ? totalRatio : 1;

        const totalHours = AI_HOURLY_RATE_USD > 0 ? costUSD / AI_HOURLY_RATE_USD : 0;

        const now = new Date();
        const startedAt = new Date(now.getTime() - totalHours * 3_600_000);

        const session = await prisma.aiSession.create({
          data: {
            issueId: resolved[0].id,
            userId: agentUserId,
            model,
            provider,
            startedAt,
            finishedAt: now,
            tokensInput,
            tokensOutput,
            costMoney: new Decimal(costUSD),
            notes: notes ?? null,
          },
        });

        // Create TimeLogs for each issue split
        const logsData = issues.map((split, idx) => {
          const normalizedRatio = split.ratio / safeTotalRatio;
          const splitHours = totalHours * normalizedRatio;
          const splitCost = costUSD * normalizedRatio;
          return {
            issueId: resolved[idx].id,
            userId: agentUserId,
            hours: new Decimal(Math.round(splitHours * 100) / 100),
            note: notes ?? null,
            logDate: now,
            source: 'AGENT' as const,
            agentSessionId: session.id,
            startedAt,
            stoppedAt: now,
            costMoney: new Decimal(Math.round(splitCost * 10_000) / 10_000),
          };
        });

        if (logsData.length > 0) {
          await prisma.timeLog.createMany({ data: logsData });
        }

        const splitLines = issues.map((s, i) => {
          const h = Math.round((totalHours * (s.ratio / safeTotalRatio)) * 100) / 100;
          return `  ${s.key} (${Math.round(s.ratio * 100)}% = ${h}h)`;
        });

        const lines = [
          `AiSession created: ${model}`,
          `Tokens: ${tokensInput.toLocaleString()} in / ${tokensOutput.toLocaleString()} out | Cost: $${costUSD.toFixed(4)}`,
          `Total hours: ${Math.round(totalHours * 100) / 100}h @ $${AI_HOURLY_RATE_USD}/hr`,
          `Logged to:`,
          ...splitLines,
          `Session ID: ${session.id}`,
        ];

        return text(lines.join('\n'));
      } catch (err) {
        return errText(err);
      }
    },
  );

  // ── get_time_summary ──────────────────────────────────────────────────────────
  server.tool(
    'get_time_summary',
    'Get human vs agent time breakdown for an issue',
    { key: z.string().describe('Issue key, e.g. TTMP-95') },
    async ({ key }) => {
      try {
        const issue = await resolveKey(key);

        const logs = await prisma.timeLog.findMany({
          where: { issueId: issue.id },
          select: { source: true, hours: true, costMoney: true, logDate: true, note: true },
          orderBy: { logDate: 'desc' },
        });

        if (logs.length === 0) return text(`${key}: No time logged yet.`);

        const humanHours = logs.filter(l => l.source === 'HUMAN').reduce((s, l) => s + Number(l.hours), 0);
        const agentHours = logs.filter(l => l.source === 'AGENT').reduce((s, l) => s + Number(l.hours), 0);
        const agentCost = logs
          .filter(l => l.source === 'AGENT' && l.costMoney)
          .reduce((s, l) => s + Number(l.costMoney ?? 0), 0);

        const aiSessions = await prisma.aiSession.findMany({
          where: { issueId: issue.id },
          select: { id: true, model: true, costMoney: true, finishedAt: true },
          orderBy: { finishedAt: 'desc' },
        });

        const sessionCost = aiSessions.reduce((s, a) => s + Number(a.costMoney ?? 0), 0);

        const lines = [
          `${key} Time Summary`,
          `─────────────────────`,
          `HUMAN:  ${humanHours.toFixed(2)}h`,
          `AGENT:  ${agentHours.toFixed(2)}h`,
          `Total:  ${(humanHours + agentHours).toFixed(2)}h`,
          ``,
          `AI cost (TimeLogs): $${agentCost.toFixed(4)}`,
          `AI cost (Sessions): $${sessionCost.toFixed(4)}`,
          `AI Sessions: ${aiSessions.length}`,
        ];

        if (aiSessions.length > 0) {
          lines.push('');
          lines.push('Recent sessions:');
          for (const s of aiSessions.slice(0, 5)) {
            lines.push(`  ${s.finishedAt.toISOString().slice(0, 16)} ${s.model} $${Number(s.costMoney ?? 0).toFixed(4)}`);
          }
        }

        return text(lines.join('\n'));
      } catch (err) {
        return errText(err);
      }
    },
  );
}

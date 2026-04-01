import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { prisma, resolveKey, getAgentUserId, text, errText } from '../context.js';

export function registerCommentTools(server: McpServer) {
  // ── add_comment ───────────────────────────────────────────────────────────────
  server.tool(
    'add_comment',
    'Add a progress update or summary comment to an issue',
    {
      key: z.string().describe('Issue key, e.g. TTMP-95'),
      body: z.string().min(1).max(10_000).describe('Comment text (markdown supported)'),
    },
    async ({ key, body }) => {
      try {
        const issue = await resolveKey(key);
        const agentUserId = await getAgentUserId();

        const comment = await prisma.comment.create({
          data: {
            issueId: issue.id,
            authorId: agentUserId,
            body,
          },
        });

        return text(`Comment added to ${key} (id: ${comment.id}) ✓`);
      } catch (err) {
        return errText(err);
      }
    },
  );

  // ── get_comments ──────────────────────────────────────────────────────────────
  server.tool(
    'get_comments',
    'Get comments on an issue',
    {
      key: z.string().describe('Issue key, e.g. TTMP-95'),
      limit: z.number().int().min(1).max(50).default(10),
    },
    async ({ key, limit }) => {
      try {
        const issue = await resolveKey(key);

        const comments = await prisma.comment.findMany({
          where: { issueId: issue.id },
          include: { author: { select: { name: true, email: true } } },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });

        if (comments.length === 0) return text(`${key}: No comments yet.`);

        const rows = comments.map(c => {
          const who = c.author.email.includes('flow-universe.internal') ? '🤖 Agent' : c.author.name;
          const when = c.createdAt.toISOString().slice(0, 16);
          return `[${when}] ${who}:\n${c.body}`;
        });

        return text(`${key} Comments (${comments.length}):\n${'─'.repeat(40)}\n${rows.join('\n' + '─'.repeat(40) + '\n')}`);
      } catch (err) {
        return errText(err);
      }
    },
  );
}

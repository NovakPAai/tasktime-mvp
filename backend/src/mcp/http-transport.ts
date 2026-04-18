import { randomUUID } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from './create-server.js';
import { mcpBearerAuth } from './auth-middleware.js';

const PORT = parseInt(process.env.MCP_HTTP_PORT ?? '3002', 10);

const app = express();
app.use(express.json());
app.use('/mcp', mcpBearerAuth);

// Session store: sessionId → { transport, lastSeen }
const transports: Record<string, { transport: StreamableHTTPServerTransport; lastSeen: number }> = {};

// Evict sessions idle for more than 30 minutes (abandoned clients that never sent DELETE)
const SESSION_TTL_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [sid, entry] of Object.entries(transports)) {
    if (now - entry.lastSeen > SESSION_TTL_MS) {
      entry.transport.close().catch(() => {});
      delete transports[sid];
    }
  }
}, 5 * 60 * 1000).unref();

// POST /mcp — main JSON-RPC endpoint
app.post('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  try {
    // Resume existing session
    if (sessionId && transports[sessionId]) {
      transports[sessionId].lastSeen = Date.now();
      await transports[sessionId].transport.handleRequest(req, res, req.body);
      return;
    }

    // New session — must start with initialize
    if (!sessionId && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid: string) => {
          transports[sid] = { transport, lastSeen: Date.now() };
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) delete transports[sid];
      };

      const server = createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: missing or unknown session ID' },
      id: null,
    });
  } catch {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

// GET /mcp — SSE stream for server-sent notifications
app.get('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  transports[sessionId].lastSeen = Date.now();
  await transports[sessionId].transport.handleRequest(req, res);
});

// DELETE /mcp — explicit session termination
app.delete('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  await transports[sessionId].transport.handleRequest(req, res);
});

// GET /health — liveness probe for Docker healthcheck
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, sessions: Object.keys(transports).length });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[MCP] HTTP server listening on :${PORT}`);
  console.log(`[MCP] Environment: ${process.env.MCP_ENV ?? 'development'}`);
});

// Graceful shutdown
async function shutdown() {
  for (const [sid, transport] of Object.entries(transports)) {
    await transport.close().catch(() => {});
    delete transports[sid];
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

import type { Request, Response, NextFunction } from 'express';

export function mcpBearerAuth(req: Request, res: Response, next: NextFunction): void {
  const token = process.env.MCP_SERVICE_TOKEN;

  if (!token) {
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'MCP_SERVICE_TOKEN not configured on server' },
      id: null,
    });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Missing Authorization: Bearer <token>' },
      id: null,
    });
    return;
  }

  const provided = authHeader.slice(7);
  if (provided !== token) {
    res.status(403).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Invalid token' },
      id: null,
    });
    return;
  }

  next();
}

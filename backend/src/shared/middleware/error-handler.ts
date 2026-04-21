import type { Request, Response, NextFunction } from 'express';
import { captureError } from '../utils/logger.js';

export class AppError extends Error {
  public code: string;
  constructor(
    public statusCode: number,
    message: string,
    public meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = message;
  }
}

const SAFE_CLIENT_META_KEYS = new Set(['retryAfter', 'code', 'field', 'details']);

function safeClientMeta(meta?: Record<string, unknown>) {
  if (!meta) return {};
  return Object.fromEntries(
    Object.entries(meta).filter(([k]) => SAFE_CLIENT_META_KEYS.has(k)),
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code, ...safeClientMeta(err.meta) });
    return;
  }
  // CVE-12: stack traces only in non-production (captureError respects LOG_LEVEL)
  captureError(err, { handler: 'errorHandler' });
  res.status(500).json({ error: 'Internal server error' });
}

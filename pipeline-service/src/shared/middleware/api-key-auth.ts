import type { Request, Response, NextFunction } from 'express';
import { config } from '../../config.js';

export interface CallerIdentity {
  userId: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      caller?: CallerIdentity;
    }
  }
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-pipeline-api-key'] as string | undefined;

  if (!apiKey || apiKey !== config.PIPELINE_API_KEY) {
    res.status(401).json({ error: 'Invalid or missing API key' });
    return;
  }

  req.caller = {
    userId: (req.headers['x-caller-user-id'] as string) || 'system',
    role: (req.headers['x-caller-role'] as string) || 'VIEWER',
  };

  next();
}

export function requireCallerRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.caller || !roles.includes(req.caller.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

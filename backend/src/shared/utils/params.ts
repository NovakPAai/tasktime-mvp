import type { Request } from 'express';

export function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

// ===== PAGINATION =====

export type PaginationParams = {
  page: number;
  limit: number;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export function parsePagination(query: { page?: string; limit?: string }): PaginationParams {
  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(query.limit ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );
  return { page, limit };
}

export function paginationToSkipTake(p: PaginationParams): { skip: number; take: number } {
  return { skip: (p.page - 1) * p.limit, take: p.limit };
}

export function buildPaginatedResponse<T>(
  items: T[],
  total: number,
  p: PaginationParams,
): { data: T[]; meta: PaginationMeta } {
  return {
    data: items,
    meta: {
      page: p.page,
      limit: p.limit,
      total,
      totalPages: Math.ceil(total / p.limit),
    },
  };
}

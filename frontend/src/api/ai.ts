import api from './client';

export interface AiEstimateBody {
  issueId?: string;
  issueKey?: string;
}

export interface AiEstimateResponse {
  issueId: string;
  estimatedHours: number;
}

export interface AiDecomposeBody {
  issueId?: string;
  issueKey?: string;
}

export interface AiDecomposeResponse {
  issueId: string;
  createdCount: number;
  children: Array<{ id: string; title: string; type: string; number: number }>;
}

export async function estimateIssue(body: AiEstimateBody): Promise<AiEstimateResponse> {
  const { data } = await api.post<AiEstimateResponse>('/ai/estimate', body);
  return data;
}

export async function decomposeIssue(body: AiDecomposeBody): Promise<AiDecomposeResponse> {
  const { data } = await api.post<AiDecomposeResponse>('/ai/decompose', body);
  return data;
}

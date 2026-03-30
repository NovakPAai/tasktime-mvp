import api from './client.js';
import type { WebVitalsMetrics } from '../lib/web-vitals.js';

export interface AggregatedMetrics {
  endpoint: string;
  method: string;
  count: number;
  avgDuration: number;
  maxDuration: number;
  minDuration: number;
  p95Duration: number;
  errorRate: number;
  lastUpdated: number;
}

export interface SystemStatus {
  totalRequests: number;
  recentRequests: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  slowEndpoints: AggregatedMetrics[];
}

export async function getSystemMetrics(): Promise<SystemStatus> {
  const { data } = await api.get<SystemStatus>('/monitoring/metrics');
  return data;
}

export async function getEndpointMetrics(minutes: number = 10): Promise<{
  minutes: number;
  count: number;
  endpoints: AggregatedMetrics[];
}> {
  const { data } = await api.get<{
    minutes: number;
    count: number;
    endpoints: AggregatedMetrics[];
  }>('/monitoring/endpoints', {
    params: { minutes },
  });
  return data;
}

export async function clearMetrics(): Promise<{ success: boolean; message: string }> {
  const { data } = await api.delete<{ success: boolean; message: string }>('/monitoring/metrics');
  return data;
}

export async function recordPageMetrics(payload: {
  url: string;
  metrics: WebVitalsMetrics;
}): Promise<{ success: boolean }> {
  const { data } = await api.post<{ success: boolean }>('/monitoring/page-metrics', payload);
  return data;
}

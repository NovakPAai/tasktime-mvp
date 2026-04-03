import { create } from 'zustand';
import * as monitoringApi from '../api/monitoring.js';
import type { SystemStatus, AggregatedMetrics } from '../api/monitoring.js';
import type { WebVitalsMetrics } from '../lib/web-vitals.js';

export interface MonitoringState {
  // System metrics from backend
  systemMetrics: SystemStatus | null;
  systemLoading: boolean;
  systemError: string | null;

  // Page metrics from Web Vitals (current session)
  pageMetrics: (WebVitalsMetrics & { recordedAt: number })[];

  // Detailed endpoints
  endpointMetrics: AggregatedMetrics[];
  endpointLoading: boolean;

  // Actions
  fetchSystemMetrics(): Promise<void>;
  fetchEndpointMetrics(minutes?: number): Promise<void>;
  recordPageMetric(metric: WebVitalsMetrics): void;
  clearMetrics(): Promise<void>;
}

export const useMonitoringStore = create<MonitoringState>((set, get) => ({
  systemMetrics: null,
  systemLoading: false,
  systemError: null,

  pageMetrics: [],

  endpointMetrics: [],
  endpointLoading: false,

  async fetchSystemMetrics() {
    set({ systemLoading: true, systemError: null });
    try {
      const metrics = await monitoringApi.getSystemMetrics();
      set({ systemMetrics: metrics, systemLoading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch metrics';
      set({ systemError: errorMessage, systemLoading: false });
    }
  },

  async fetchEndpointMetrics(minutes = 10) {
    set({ endpointLoading: true });
    try {
      const result = await monitoringApi.getEndpointMetrics(minutes);
      set({ endpointMetrics: result.endpoints, endpointLoading: false });
    } catch {
      set({ endpointLoading: false });
    }
  },

  recordPageMetric(metric: WebVitalsMetrics) {
    const state = get();
    // Keep only last 20 page metrics
    const updated = [
      ...state.pageMetrics,
      { ...metric, recordedAt: Date.now() },
    ].slice(-20);
    set({ pageMetrics: updated });
  },

  async clearMetrics() {
    try {
      await monitoringApi.clearMetrics();
      set({ systemMetrics: null, pageMetrics: [] });
    } catch (error) {
      console.error('Failed to clear metrics:', error);
    }
  },
}));

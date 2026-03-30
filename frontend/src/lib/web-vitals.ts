import { onCLS, onFCP, onLCP, onTTFB } from 'web-vitals';
import type { Metric } from 'web-vitals';
import * as monitoringApi from '../api/monitoring.js';

export interface WebVitalsMetrics {
  fcp?: number;
  lcp?: number;
  cls?: number;
  fid?: number;
  ttfb?: number;
  url: string;
  timestamp: number;
}

export function initializeWebVitals() {
  const pageUrl = window.location.pathname + window.location.search;

  onFCP((metric: Metric) => {
    void recordPageMetric({ fcp: Math.round(metric.value), url: pageUrl, timestamp: Date.now() });
  });

  onLCP((metric: Metric) => {
    void recordPageMetric({ lcp: Math.round(metric.value), url: pageUrl, timestamp: Date.now() });
  });

  onCLS((metric: Metric) => {
    void recordPageMetric({ cls: Math.round(metric.value * 1000) / 1000, url: pageUrl, timestamp: Date.now() });
  });

  onTTFB((metric: Metric) => {
    void recordPageMetric({ ttfb: Math.round(metric.value), url: pageUrl, timestamp: Date.now() });
  });
}

async function recordPageMetric(metrics: WebVitalsMetrics) {
  try {
    await monitoringApi.recordPageMetrics({ url: metrics.url, metrics });
  } catch (error) {
    console.debug('Failed to record page metrics:', error);
  }
}

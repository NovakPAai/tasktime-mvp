interface MetricEntry {
  endpoint: string;
  method: string;
  statusCode: number;
  duration: number;
  timestamp: number;
}

interface AggregatedMetrics {
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

class MonitoringService {
  private metrics: MetricEntry[] = [];
  private readonly MAX_METRICS = 1000;

  recordMetric(endpoint: string, method: string, statusCode: number, duration: number) {
    this.metrics.push({
      endpoint,
      method,
      statusCode,
      duration,
      timestamp: Date.now(),
    });

    // Keep only last N metrics
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }
  }

  getMetrics(minutes: number = 10): AggregatedMetrics[] {
    const cutoffTime = Date.now() - minutes * 60 * 1000;
    const recentMetrics = this.metrics.filter((m) => m.timestamp >= cutoffTime);

    const grouped = new Map<string, MetricEntry[]>();
    for (const metric of recentMetrics) {
      const key = `${metric.method} ${metric.endpoint}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(metric);
    }

    const aggregated: AggregatedMetrics[] = [];
    for (const [key, entries] of grouped) {
      const [method, endpoint] = key.split(' ');
      const durations = entries.map((e) => e.duration).sort((a, b) => a - b);
      const errors = entries.filter((e) => e.statusCode >= 400).length;

      aggregated.push({
        endpoint,
        method,
        count: entries.length,
        avgDuration: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
        maxDuration: durations[durations.length - 1],
        minDuration: durations[0],
        p95Duration: durations[Math.floor(durations.length * 0.95)],
        errorRate: Math.round((errors / entries.length) * 100),
        lastUpdated: Math.max(...entries.map((e) => e.timestamp)),
      });
    }

    return aggregated.sort((a, b) => b.lastUpdated - a.lastUpdated);
  }

  getSystemStatus() {
    const metrics = this.getMetrics(10);
    const allDurations = this.metrics.map((m) => m.duration).sort((a, b) => a - b);

    return {
      totalRequests: this.metrics.length,
      recentRequests: this.metrics.filter((m) => m.timestamp >= Date.now() - 10 * 60 * 1000).length,
      avgResponseTime: allDurations.length ? Math.round(allDurations.reduce((a, b) => a + b, 0) / allDurations.length) : 0,
      p95ResponseTime: allDurations.length ? allDurations[Math.floor(allDurations.length * 0.95)] : 0,
      p99ResponseTime: allDurations.length ? allDurations[Math.floor(allDurations.length * 0.99)] : 0,
      errorRate: this.metrics.length
        ? Math.round(
            (this.metrics.filter((m) => m.statusCode >= 400).length / this.metrics.length) *
              100
          )
        : 0,
      slowEndpoints: metrics
        .sort((a, b) => b.avgDuration - a.avgDuration)
        .slice(0, 5),
    };
  }

  clearMetrics() {
    this.metrics = [];
  }
}

export const monitoringService = new MonitoringService();

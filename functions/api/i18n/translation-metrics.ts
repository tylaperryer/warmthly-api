/**
 * Translation Performance Monitoring
 * Tracks translation performance metrics for optimization
 * 
 * Metrics tracked:
 * - Provider response times
 * - Cache hit rates
 * - Quality scores
 * - Error rates per provider
 * - Translation success rates
 */

/**
 * Translation metric entry
 */
export interface TranslationMetric {
  /** Timestamp of the metric */
  timestamp: number;
  /** Provider name */
  provider: string;
  /** Source language */
  sourceLang: string;
  /** Target language */
  targetLang: string;
  /** Response time in milliseconds */
  responseTime: number;
  /** Whether translation was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Quality score if available */
  qualityScore?: number;
  /** Whether result came from cache */
  fromCache: boolean;
  /** Text length (characters) */
  textLength: number;
}

/**
 * Provider performance statistics
 */
export interface ProviderStats {
  /** Provider name */
  provider: string;
  /** Total requests */
  totalRequests: number;
  /** Successful requests */
  successfulRequests: number;
  /** Failed requests */
  failedRequests: number;
  /** Average response time (ms) */
  averageResponseTime: number;
  /** Average quality score */
  averageQualityScore: number;
  /** Cache hit rate (0-1) */
  cacheHitRate: number;
  /** Error rate (0-1) */
  errorRate: number;
}

/**
 * Overall translation statistics
 */
export interface TranslationStats {
  /** Total translations */
  totalTranslations: number;
  /** Cache hits */
  cacheHits: number;
  /** Cache misses */
  cacheMisses: number;
  /** Overall cache hit rate */
  cacheHitRate: number;
  /** Average quality score */
  averageQualityScore: number;
  /** Provider statistics */
  providerStats: ProviderStats[];
  /** Most requested languages */
  topLanguages: Array<{ language: string; count: number }>;
  /** Error rate */
  errorRate: number;
}

/**
 * In-memory metrics storage
 * In production, consider using Cloudflare Analytics or external service
 */
class MetricsStore {
  private metrics: TranslationMetric[] = [];
  private maxMetrics = 10000; // Keep last 10k metrics

  add(metric: TranslationMetric): void {
    this.metrics.push(metric);
    
    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  getAll(): TranslationMetric[] {
    return [...this.metrics];
  }

  getByProvider(provider: string): TranslationMetric[] {
    return this.metrics.filter(m => m.provider === provider);
  }

  getByTimeRange(startTime: number, endTime: number): TranslationMetric[] {
    return this.metrics.filter(
      m => m.timestamp >= startTime && m.timestamp <= endTime
    );
  }

  clear(): void {
    this.metrics = [];
  }

  getStats(): TranslationStats {
    const total = this.metrics.length;
    if (total === 0) {
      return {
        totalTranslations: 0,
        cacheHits: 0,
        cacheMisses: 0,
        cacheHitRate: 0,
        averageQualityScore: 0,
        providerStats: [],
        topLanguages: [],
        errorRate: 0,
      };
    }

    const cacheHits = this.metrics.filter(m => m.fromCache).length;
    const cacheMisses = total - cacheHits;
    const cacheHitRate = cacheHits / total;

    const successful = this.metrics.filter(m => m.success).length;
    const failed = total - successful;
    const errorRate = failed / total;

    // Calculate average quality score
    const qualityScores = this.metrics
      .filter(m => m.qualityScore !== undefined)
      .map(m => m.qualityScore!);
    const averageQualityScore = qualityScores.length > 0
      ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
      : 0;

    // Group by provider
    const providerMap = new Map<string, TranslationMetric[]>();
    for (const metric of this.metrics) {
      if (!providerMap.has(metric.provider)) {
        providerMap.set(metric.provider, []);
      }
      providerMap.get(metric.provider)!.push(metric);
    }

    const providerStats: ProviderStats[] = Array.from(providerMap.entries()).map(
      ([provider, metrics]) => {
        const totalRequests = metrics.length;
        const successfulRequests = metrics.filter(m => m.success).length;
        const failedRequests = totalRequests - successfulRequests;
        
        const responseTimes = metrics.map(m => m.responseTime);
        const averageResponseTime = responseTimes.length > 0
          ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
          : 0;

        const qualityScores = metrics
          .filter(m => m.qualityScore !== undefined)
          .map(m => m.qualityScore!);
        const averageQualityScore = qualityScores.length > 0
          ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
          : 0;

        const cacheHits = metrics.filter(m => m.fromCache).length;
        const cacheHitRate = cacheHits / totalRequests;

        return {
          provider,
          totalRequests,
          successfulRequests,
          failedRequests,
          averageResponseTime,
          averageQualityScore,
          cacheHitRate,
          errorRate: failedRequests / totalRequests,
        };
      }
    );

    // Top languages
    const languageMap = new Map<string, number>();
    for (const metric of this.metrics) {
      const lang = metric.targetLang;
      languageMap.set(lang, (languageMap.get(lang) || 0) + 1);
    }

    const topLanguages = Array.from(languageMap.entries())
      .map(([language, count]) => ({ language, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalTranslations: total,
      cacheHits,
      cacheMisses,
      cacheHitRate,
      averageQualityScore,
      providerStats,
      topLanguages,
      errorRate,
    };
  }
}

/**
 * Global metrics store
 */
const metricsStore = new MetricsStore();

/**
 * Track a translation metric
 */
export function trackTranslationMetric(metric: Omit<TranslationMetric, 'timestamp'>): void {
  metricsStore.add({
    ...metric,
    timestamp: Date.now(),
  });
}

/**
 * Track translation start (for timing)
 */
export function trackTranslationStart(): number {
  return Date.now();
}

/**
 * Track translation completion
 */
export function trackTranslationComplete(
  startTime: number,
  provider: string,
  sourceLang: string,
  targetLang: string,
  success: boolean,
  options: {
    error?: string;
    qualityScore?: number;
    fromCache?: boolean;
    textLength?: number;
  } = {}
): void {
  const responseTime = Date.now() - startTime;

  trackTranslationMetric({
    provider,
    sourceLang,
    targetLang,
    responseTime,
    success,
    error: options.error,
    qualityScore: options.qualityScore,
    fromCache: options.fromCache || false,
    textLength: options.textLength || 0,
  });
}

/**
 * Get translation statistics
 */
export function getTranslationStats(): TranslationStats {
  return metricsStore.getStats();
}

/**
 * Get provider statistics
 */
export function getProviderStats(provider: string): ProviderStats | null {
  const stats = metricsStore.getStats();
  return stats.providerStats.find(p => p.provider === provider) || null;
}

/**
 * Get metrics for a time range
 */
export function getMetricsByTimeRange(
  startTime: number,
  endTime: number
): TranslationMetric[] {
  return metricsStore.getByTimeRange(startTime, endTime);
}

/**
 * Clear all metrics
 */
export function clearMetrics(): void {
  metricsStore.clear();
}

/**
 * Check if performance is degrading
 * Returns true if error rate is high or response times are slow
 */
export function checkPerformanceDegradation(): {
  isDegrading: boolean;
  issues: string[];
} {
  const stats = getTranslationStats();
  const issues: string[] = [];

  // Check overall error rate
  if (stats.errorRate > 0.1) {
    issues.push(`High error rate: ${(stats.errorRate * 100).toFixed(1)}%`);
  }

  // Check provider performance
  for (const providerStat of stats.providerStats) {
    if (providerStat.errorRate > 0.2) {
      issues.push(
        `Provider ${providerStat.provider} has high error rate: ${(providerStat.errorRate * 100).toFixed(1)}%`
      );
    }

    if (providerStat.averageResponseTime > 10000) {
      issues.push(
        `Provider ${providerStat.provider} is slow: ${providerStat.averageResponseTime.toFixed(0)}ms average`
      );
    }
  }

  // Check cache hit rate
  if (stats.cacheHitRate < 0.3) {
    issues.push(`Low cache hit rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`);
  }

  return {
    isDegrading: issues.length > 0,
    issues,
  };
}

/**
 * Get performance summary for logging
 */
export function getPerformanceSummary(): string {
  const stats = getTranslationStats();
  const degradation = checkPerformanceDegradation();

  const lines = [
    `Translation Performance Summary:`,
    `  Total translations: ${stats.totalTranslations}`,
    `  Cache hit rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`,
    `  Error rate: ${(stats.errorRate * 100).toFixed(1)}%`,
    `  Average quality score: ${stats.averageQualityScore.toFixed(2)}`,
    `  Top languages: ${stats.topLanguages.slice(0, 5).map(l => `${l.language} (${l.count})`).join(', ')}`,
  ];

  if (degradation.isDegrading) {
    lines.push(`  ⚠️ Performance issues detected:`);
    degradation.issues.forEach(issue => {
      lines.push(`    - ${issue}`);
    });
  }

  return lines.join('\n');
}


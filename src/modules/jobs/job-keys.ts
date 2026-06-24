export function buildScheduledDedupeKey(monitoringRuleId: string, date: Date): string {
  const dateKey = date.toISOString().slice(0, 10);
  return `scheduled:${monitoringRuleId}:${dateKey}`;
}

export function buildManualDedupeKey(assetId: string, requestId: string): string {
  return `manual:${assetId}:${requestId}`;
}

export function buildEvidenceJobId(detectionId: string, scanRunId: string): string {
  return `evidence-${detectionId}-${scanRunId}`;
}

export function buildWaybackJobId(detectionId: string): string {
  return `wayback-${detectionId}`;
}

export function buildSiteIntelJobId(detectionId: string): string {
  return `site-intel-${detectionId}`;
}

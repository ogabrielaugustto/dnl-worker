export type DatabaseMonitoringRuleFrequency = "hourly" | "daily" | "weekly" | "monthly";
export type DatabaseScanJobType = "manual_scan" | "scheduled_scan" | "retry_scan";
export type DatabaseScanJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";
export type DatabaseScanRunStatus =
  | "started"
  | "vision_completed"
  | "evidence_pending"
  | "completed"
  | "failed";
export type DatabaseAssetStatus = "draft" | "active" | "paused" | "archived";
export type DatabaseEvidenceCaptureStatus =
  | "pending"
  | "processing"
  | "captured"
  | "failed"
  | "skipped";
export type SourcePriority = "high" | "medium" | "low";
export type SourceType = "portal" | "blog" | "ecommerce" | "government" | "marketplace" | "other";
export type SourceCrawlRunStatus = "processing" | "completed" | "failed";

export type MonitoringRuleRecord = {
  id: string;
  organization_id: string;
  asset_id: string | null;
  name: string;
  frequency: DatabaseMonitoringRuleFrequency;
  is_active: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  archived_at: string | null;
};

export type ScanJobRecord = {
  id: string;
  organization_id: string;
  asset_id: string;
  monitoring_rule_id: string | null;
  requested_by_user_id: string | null;
  type: DatabaseScanJobType;
  status: DatabaseScanJobStatus;
  priority: number;
  scheduled_at: string;
  started_at: string | null;
  finished_at: string | null;
  attempts: number;
  max_attempts: number;
  error_code: string | null;
  error_message: string | null;
  dedupe_key: string;
  queue_name: string;
  available_at: string;
  locked_at: string | null;
  locked_by: string | null;
  completed_run_id: string | null;
};

export type ScanRunRecord = {
  id: string;
  organization_id: string;
  scan_job_id: string;
  asset_id: string;
  status: DatabaseScanRunStatus;
  attempt_number: number;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  worker_id: string | null;
  error_code: string | null;
  error_message: string | null;
  context: Record<string, unknown>;
};

export type AssetWithPrimaryFileRecord = {
  id: string;
  organization_id: string;
  title: string;
  status: DatabaseAssetStatus;
  asset_files: Array<{
    id: string;
    public_url: string | null;
    storage_key: string | null;
    original_file_name: string | null;
    mime_type: string | null;
    hash_sha256: string | null;
    phash: string | null;
    is_primary: boolean;
  }>;
};

export type DetectionRecord = {
  id: string;
  organization_id: string;
  asset_id: string;
  scan_job_id: string | null;
  source_url: string;
  canonical_source_url: string;
  matched_image_url: string | null;
  canonical_matched_image_url: string;
  page_title: string | null;
  domain: string | null;
  confidence_score: number | null;
  vision_payload: Record<string, unknown>;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  last_scanned_at: string | null;
  archived_at: string | null;
};

export type DetectionEvidenceRecord = {
  id: string;
  organization_id: string;
  detection_id: string;
  scan_run_id: string | null;
  screenshot_storage_key: string | null;
  screenshot_public_url: string | null;
  matched_image_storage_key: string | null;
  captured_at: string | null;
  capture_status: DatabaseEvidenceCaptureStatus;
  capture_error_message: string | null;
  metadata: Record<string, unknown>;
  source_url_snapshot: string | null;
  matched_image_url_snapshot: string | null;
  created_at: string;
};

export type MonitoredSourceRecord = {
  id: string;
  name: string;
  domain: string;
  base_url: string;
  source_type: SourceType;
  priority: SourcePriority;
  crawl_frequency_hours: number;
  discovery_modes: string[];
  sitemap_urls: string[];
  crawl_window_days: number;
  max_pages_per_run: number;
  is_active: boolean;
  last_crawled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SourceCrawlRunRecord = {
  id: string;
  source_id: string;
  status: SourceCrawlRunStatus;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  pages_discovered: number;
  pages_crawled: number;
  images_discovered: number;
  matches_created: number;
  error_code: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
};

export type CrawledPageRecord = {
  id: string;
  source_id: string;
  crawl_run_id: string | null;
  url: string;
  canonical_url: string;
  domain: string | null;
  title: string | null;
  status_code: number | null;
  content_hash: string | null;
  crawled_at: string;
};

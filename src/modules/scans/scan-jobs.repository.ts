import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AssetWithPrimaryFileRecord,
  MonitoringRuleRecord,
  ScanJobRecord,
  ScanRunRecord,
} from "../shared/types.js";
import { AppError, ConflictError, NotFoundError } from "../shared/errors.js";

export type ScheduledScanJobRecord = {
  scan_job_id: string;
  dedupe_key: string;
  priority: number;
  organization_id: string;
  asset_id: string;
  monitoring_rule_id: string;
  scheduled_at: string;
};

export async function scheduleDueScanJobs(
  supabase: SupabaseClient,
): Promise<ScheduledScanJobRecord[]> {
  const { data, error } = await supabase.rpc("worker_schedule_due_scan_jobs");

  if (error) {
    throw new AppError(error.message, {
      code: "schedule_due_scan_jobs_failed",
      retryable: true,
    });
  }

  return (data ?? []) as ScheduledScanJobRecord[];
}

export async function listPendingScanJobs(supabase: SupabaseClient): Promise<ScanJobRecord[]> {
  const { data, error } = await supabase
    .from("scan_jobs")
    .select(
      "id, organization_id, asset_id, monitoring_rule_id, requested_by_user_id, type, status, priority, scheduled_at, started_at, finished_at, attempts, max_attempts, error_code, error_message, dedupe_key, queue_name, available_at, locked_at, locked_by, completed_run_id",
    )
    .eq("status", "pending")
    .lte("available_at", new Date().toISOString())
    .order("priority", { ascending: true })
    .order("scheduled_at", { ascending: true });

  if (error) {
    throw new AppError(error.message, {
      code: "list_pending_scan_jobs_failed",
      retryable: true,
    });
  }

  return (data ?? []) as ScanJobRecord[];
}

export async function getScanJobById(
  supabase: SupabaseClient,
  scanJobId: string,
): Promise<ScanJobRecord> {
  const { data, error } = await supabase
    .from("scan_jobs")
    .select(
      "id, organization_id, asset_id, monitoring_rule_id, requested_by_user_id, type, status, priority, scheduled_at, started_at, finished_at, attempts, max_attempts, error_code, error_message, dedupe_key, queue_name, available_at, locked_at, locked_by, completed_run_id",
    )
    .eq("id", scanJobId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      code: "get_scan_job_failed",
      retryable: true,
    });
  }

  if (!data) {
    throw new NotFoundError("Scan job not found", "scan_job_not_found");
  }

  return data as ScanJobRecord;
}

export async function claimScanJob(
  supabase: SupabaseClient,
  scanJobId: string,
  workerId: string,
): Promise<ScanJobRecord> {
  const scanJob = await getScanJobById(supabase, scanJobId);

  if (scanJob.status !== "pending") {
    throw new ConflictError("Scan job is not pending", "scan_job_not_pending");
  }

  const startedAt = new Date().toISOString();
  const nextAttempt = scanJob.attempts + 1;

  const { data, error } = await supabase
    .from("scan_jobs")
    .update({
      status: "processing",
      started_at: startedAt,
      attempts: nextAttempt,
      locked_at: startedAt,
      locked_by: workerId,
      error_code: null,
      error_message: null,
    })
    .eq("id", scanJobId)
    .eq("status", "pending")
    .select(
      "id, organization_id, asset_id, monitoring_rule_id, requested_by_user_id, type, status, priority, scheduled_at, started_at, finished_at, attempts, max_attempts, error_code, error_message, dedupe_key, queue_name, available_at, locked_at, locked_by, completed_run_id",
    )
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      code: "claim_scan_job_failed",
      retryable: true,
    });
  }

  if (!data) {
    throw new ConflictError("Scan job could not be claimed", "scan_job_claim_failed");
  }

  return data as ScanJobRecord;
}

export async function createScanRun(
  supabase: SupabaseClient,
  scanJob: ScanJobRecord,
  workerId: string,
): Promise<ScanRunRecord> {
  const { data, error } = await supabase
    .from("scan_runs")
    .insert({
      organization_id: scanJob.organization_id,
      scan_job_id: scanJob.id,
      asset_id: scanJob.asset_id,
      status: "started",
      attempt_number: scanJob.attempts,
      worker_id: workerId,
      context: {},
    })
    .select(
      "id, organization_id, scan_job_id, asset_id, status, attempt_number, started_at, finished_at, duration_ms, worker_id, error_code, error_message, context",
    )
    .single();

  if (error) {
    throw new AppError(error.message, {
      code: "create_scan_run_failed",
      retryable: true,
    });
  }

  return data as ScanRunRecord;
}

export async function getAssetWithPrimaryFile(
  supabase: SupabaseClient,
  organizationId: string,
  assetId: string,
): Promise<AssetWithPrimaryFileRecord> {
  const { data, error } = await supabase
    .from("assets")
    .select(
      "id, organization_id, title, status, asset_files!inner(id, public_url, storage_key, original_file_name, mime_type, hash_sha256, phash, is_primary)",
    )
    .eq("id", assetId)
    .eq("organization_id", organizationId)
    .eq("asset_files.is_primary", true)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      code: "get_asset_with_primary_file_failed",
      retryable: true,
    });
  }

  if (!data) {
    throw new NotFoundError("Asset with primary file not found", "asset_primary_file_not_found");
  }

  return data as unknown as AssetWithPrimaryFileRecord;
}

export async function completeScanRun(
  supabase: SupabaseClient,
  scanRunId: string,
  startedAt: string,
  status: "vision_completed" | "evidence_pending" | "completed",
  context: Record<string, unknown>,
): Promise<void> {
  const finishedAt = new Date();
  const durationMs = Math.max(0, finishedAt.getTime() - new Date(startedAt).getTime());
  const { error } = await supabase
    .from("scan_runs")
    .update({
      status,
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      context,
    })
    .eq("id", scanRunId);

  if (error) {
    throw new AppError(error.message, {
      code: "complete_scan_run_failed",
      retryable: true,
    });
  }
}

export async function failScanRun(
  supabase: SupabaseClient,
  scanRunId: string,
  startedAt: string,
  errorCode: string,
  errorMessage: string,
  context: Record<string, unknown>,
): Promise<void> {
  const finishedAt = new Date();
  const durationMs = Math.max(0, finishedAt.getTime() - new Date(startedAt).getTime());
  const { error } = await supabase
    .from("scan_runs")
    .update({
      status: "failed",
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      error_code: errorCode,
      error_message: errorMessage,
      context,
    })
    .eq("id", scanRunId);

  if (error) {
    throw new AppError(error.message, {
      code: "fail_scan_run_failed",
      retryable: true,
    });
  }
}

export async function completeScanJob(
  supabase: SupabaseClient,
  scanJobId: string,
  completedRunId: string,
): Promise<void> {
  const { error } = await supabase
    .from("scan_jobs")
    .update({
      status: "completed",
      finished_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      completed_run_id: completedRunId,
      error_code: null,
      error_message: null,
    })
    .eq("id", scanJobId);

  if (error) {
    throw new AppError(error.message, {
      code: "complete_scan_job_failed",
      retryable: true,
    });
  }
}

export async function releaseScanJobForRetry(
  supabase: SupabaseClient,
  scanJob: ScanJobRecord,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  const nextStatus = scanJob.attempts >= scanJob.max_attempts ? "failed" : "pending";

  const { error } = await supabase
    .from("scan_jobs")
    .update({
      status: nextStatus,
      finished_at: nextStatus === "failed" ? new Date().toISOString() : null,
      locked_at: null,
      locked_by: null,
      error_code: errorCode,
      error_message: errorMessage,
    })
    .eq("id", scanJob.id);

  if (error) {
    throw new AppError(error.message, {
      code: "release_scan_job_failed",
      retryable: true,
    });
  }
}

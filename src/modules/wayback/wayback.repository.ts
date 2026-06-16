import type { SupabaseClient } from "@supabase/supabase-js";

import { AppError } from "../shared/errors.js";
import type { DetectionWaybackCaptureRecord } from "../shared/types.js";

const waybackCaptureSelect = `
  id,
  organization_id,
  detection_id,
  scan_run_id,
  source_url,
  canonical_source_url,
  capture_status,
  save_job_id,
  save_http_status,
  save_requested_at,
  save_completed_at,
  availability_checked_at,
  latest_snapshot_url,
  latest_snapshot_timestamp,
  latest_snapshot_at,
  latest_snapshot_status,
  error_message,
  timeline,
  metadata,
  created_at,
  updated_at
`;

export async function getWaybackCaptureByDetectionId(
  supabase: SupabaseClient,
  detectionId: string,
): Promise<DetectionWaybackCaptureRecord | null> {
  const { data, error } = await supabase
    .from("detection_wayback_captures")
    .select(waybackCaptureSelect)
    .eq("detection_id", detectionId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      code: "get_wayback_capture_failed",
      retryable: true,
    });
  }

  return (data as DetectionWaybackCaptureRecord | null) ?? null;
}

export async function ensureQueuedWaybackCapture(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    detectionId: string;
    scanRunId: string | null;
    sourceUrl: string;
    canonicalSourceUrl: string;
  },
): Promise<{ record: DetectionWaybackCaptureRecord; wasCreated: boolean }> {
  const existing = await getWaybackCaptureByDetectionId(supabase, params.detectionId);

  if (existing) {
    return {
      record: existing,
      wasCreated: false,
    };
  }

  const { data, error } = await supabase
    .from("detection_wayback_captures")
    .insert({
      organization_id: params.organizationId,
      detection_id: params.detectionId,
      scan_run_id: params.scanRunId,
      source_url: params.sourceUrl,
      canonical_source_url: params.canonicalSourceUrl,
      capture_status: "queued",
      timeline: [],
      metadata: {},
    })
    .select(waybackCaptureSelect)
    .single();

  if (error) {
    if (error.code === "23505") {
      const concurrentRecord = await getWaybackCaptureByDetectionId(supabase, params.detectionId);

      if (concurrentRecord) {
        return {
          record: concurrentRecord,
          wasCreated: false,
        };
      }
    }

    throw new AppError(error.message, {
      code: "insert_wayback_capture_failed",
      retryable: true,
    });
  }

  return {
    record: data as DetectionWaybackCaptureRecord,
    wasCreated: true,
  };
}

export async function markWaybackCaptureProcessing(
  supabase: SupabaseClient,
  detectionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("detection_wayback_captures")
    .update({
      capture_status: "processing",
      error_message: null,
      metadata: {
        processingStartedAt: new Date().toISOString(),
      },
    })
    .eq("detection_id", detectionId);

  if (error) {
    throw new AppError(error.message, {
      code: "mark_wayback_capture_processing_failed",
      retryable: true,
    });
  }
}

export async function completeWaybackCapture(
  supabase: SupabaseClient,
  params: {
    detectionId: string;
    captureStatus: "submitted" | "captured" | "unavailable";
    saveJobId: string | null;
    saveHttpStatus: number | null;
    latestSnapshotUrl: string | null;
    latestSnapshotTimestamp: string | null;
    latestSnapshotAt: string | null;
    latestSnapshotStatus: string | null;
    timeline: Array<Record<string, unknown>>;
    metadata: Record<string, unknown>;
    errorMessage: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("detection_wayback_captures")
    .update({
      capture_status: params.captureStatus,
      save_job_id: params.saveJobId,
      save_http_status: params.saveHttpStatus,
      save_completed_at: now,
      availability_checked_at: now,
      latest_snapshot_url: params.latestSnapshotUrl,
      latest_snapshot_timestamp: params.latestSnapshotTimestamp,
      latest_snapshot_at: params.latestSnapshotAt,
      latest_snapshot_status: params.latestSnapshotStatus,
      timeline: params.timeline,
      metadata: params.metadata,
      error_message: params.errorMessage,
    })
    .eq("detection_id", params.detectionId);

  if (error) {
    throw new AppError(error.message, {
      code: "complete_wayback_capture_failed",
      retryable: true,
    });
  }
}

export async function failWaybackCapture(
  supabase: SupabaseClient,
  params: {
    detectionId: string;
    saveJobId: string | null;
    saveHttpStatus: number | null;
    errorMessage: string;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("detection_wayback_captures")
    .update({
      capture_status: "failed",
      save_job_id: params.saveJobId,
      save_http_status: params.saveHttpStatus,
      save_completed_at: now,
      availability_checked_at: now,
      error_message: params.errorMessage,
      metadata: params.metadata,
    })
    .eq("detection_id", params.detectionId);

  if (error) {
    throw new AppError(error.message, {
      code: "fail_wayback_capture_failed",
      retryable: true,
    });
  }
}

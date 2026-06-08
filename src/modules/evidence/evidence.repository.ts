import type { SupabaseClient } from "@supabase/supabase-js";

import { AppError } from "../shared/errors.js";
import type { DetectionEvidenceRecord } from "../shared/types.js";

export async function getLatestDetectionEvidence(
  supabase: SupabaseClient,
  detectionId: string,
): Promise<DetectionEvidenceRecord | null> {
  const { data, error } = await supabase
    .from("detection_evidences")
    .select(
      "id, organization_id, detection_id, scan_run_id, screenshot_storage_key, screenshot_public_url, matched_image_storage_key, captured_at, capture_status, capture_error_message, metadata, source_url_snapshot, matched_image_url_snapshot, created_at",
    )
    .eq("detection_id", detectionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      code: "get_latest_detection_evidence_failed",
      retryable: true,
    });
  }

  return (data as DetectionEvidenceRecord | null) ?? null;
}

export async function upsertPendingDetectionEvidence(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    detectionId: string;
    scanRunId: string | null;
    sourceUrl: string;
    matchedImageUrl: string | null;
  },
): Promise<void> {
  const existing = await getLatestDetectionEvidence(supabase, params.detectionId);

  if (existing && existing.scan_run_id === params.scanRunId) {
    let query = supabase
      .from("detection_evidences")
      .update({
        capture_status: "pending",
        capture_error_message: null,
        source_url_snapshot: params.sourceUrl,
        matched_image_url_snapshot: params.matchedImageUrl,
        metadata: {
          requeuedAt: new Date().toISOString(),
        },
      })
      .eq("id", existing.id);
    const { error } = await query;

    if (error) {
      throw new AppError(error.message, {
        code: "update_pending_detection_evidence_failed",
        retryable: true,
      });
    }

    return;
  }

  const { error } = await supabase.from("detection_evidences").insert({
    organization_id: params.organizationId,
    detection_id: params.detectionId,
    scan_run_id: params.scanRunId,
    capture_status: "pending",
    source_url_snapshot: params.sourceUrl,
    matched_image_url_snapshot: params.matchedImageUrl,
    metadata: {},
  });

  if (error) {
    throw new AppError(error.message, {
      code: "insert_pending_detection_evidence_failed",
      retryable: true,
    });
  }
}

export async function markEvidenceProcessing(
  supabase: SupabaseClient,
  detectionId: string,
  scanRunId: string | null,
): Promise<void> {
  let query = supabase
    .from("detection_evidences")
    .update({
      capture_status: "processing",
      capture_error_message: null,
    })
    .eq("detection_id", detectionId);
  query = scanRunId ? query.eq("scan_run_id", scanRunId) : query.is("scan_run_id", null);
  const { error } = await query;

  if (error) {
    throw new AppError(error.message, {
      code: "mark_evidence_processing_failed",
      retryable: true,
    });
  }
}

export async function markEvidenceCaptured(
  supabase: SupabaseClient,
  params: {
    detectionId: string;
    scanRunId: string | null;
    screenshotStorageKey: string | null;
    matchedImageStorageKey: string | null;
    finalUrl: string;
    capturedAt: string;
    errorMessage: string | null;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  let query = supabase
    .from("detection_evidences")
    .update({
      capture_status: "captured",
      screenshot_storage_key: params.screenshotStorageKey,
      screenshot_public_url: null,
      matched_image_storage_key: params.matchedImageStorageKey,
      captured_at: params.capturedAt,
      capture_error_message: params.errorMessage,
      metadata: params.metadata,
    })
    .eq("detection_id", params.detectionId);
  query = params.scanRunId
    ? query.eq("scan_run_id", params.scanRunId)
    : query.is("scan_run_id", null);
  const { error } = await query;

  if (error) {
    throw new AppError(error.message, {
      code: "mark_evidence_captured_failed",
      retryable: true,
    });
  }
}

export async function markEvidenceFailed(
  supabase: SupabaseClient,
  params: {
    detectionId: string;
    scanRunId: string | null;
    errorMessage: string;
  },
): Promise<void> {
  let query = supabase
    .from("detection_evidences")
    .update({
      capture_status: "failed",
      capture_error_message: params.errorMessage,
    })
    .eq("detection_id", params.detectionId);
  query = params.scanRunId
    ? query.eq("scan_run_id", params.scanRunId)
    : query.is("scan_run_id", null);
  const { error } = await query;

  if (error) {
    throw new AppError(error.message, {
      code: "mark_evidence_failed_failed",
      retryable: true,
    });
  }
}

export async function hasOpenEvidenceForScanRun(
  supabase: SupabaseClient,
  scanRunId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("detection_evidences")
    .select("id", { count: "exact", head: true })
    .eq("scan_run_id", scanRunId)
    .in("capture_status", ["pending", "processing"]);

  if (error) {
    throw new AppError(error.message, {
      code: "count_open_detection_evidences_failed",
      retryable: true,
    });
  }

  return (count ?? 0) > 0;
}

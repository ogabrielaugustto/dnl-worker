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
      "id, organization_id, detection_id, scan_run_id, screenshot_storage_key, screenshot_public_url, captured_at, capture_status, capture_error_message, metadata, source_url_snapshot, created_at",
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
    scanRunId: string;
    sourceUrl: string;
  },
): Promise<void> {
  const existing = await getLatestDetectionEvidence(supabase, params.detectionId);

  if (existing && existing.scan_run_id === params.scanRunId) {
    const { error } = await supabase
      .from("detection_evidences")
      .update({
        capture_status: "pending",
        capture_error_message: null,
        source_url_snapshot: params.sourceUrl,
        metadata: {
          requeuedAt: new Date().toISOString(),
        },
      })
      .eq("id", existing.id);

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
  scanRunId: string,
): Promise<void> {
  const { error } = await supabase
    .from("detection_evidences")
    .update({
      capture_status: "processing",
      capture_error_message: null,
    })
    .eq("detection_id", detectionId)
    .eq("scan_run_id", scanRunId);

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
    scanRunId: string;
    screenshotStorageKey: string;
    finalUrl: string;
    capturedAt: string;
  },
): Promise<void> {
  const { error } = await supabase
    .from("detection_evidences")
    .update({
      capture_status: "captured",
      screenshot_storage_key: params.screenshotStorageKey,
      screenshot_public_url: null,
      captured_at: params.capturedAt,
      capture_error_message: null,
      metadata: {
        finalUrl: params.finalUrl,
      },
    })
    .eq("detection_id", params.detectionId)
    .eq("scan_run_id", params.scanRunId);

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
    scanRunId: string;
    errorMessage: string;
  },
): Promise<void> {
  const { error } = await supabase
    .from("detection_evidences")
    .update({
      capture_status: "failed",
      capture_error_message: params.errorMessage,
    })
    .eq("detection_id", params.detectionId)
    .eq("scan_run_id", params.scanRunId);

  if (error) {
    throw new AppError(error.message, {
      code: "mark_evidence_failed_failed",
      retryable: true,
    });
  }
}

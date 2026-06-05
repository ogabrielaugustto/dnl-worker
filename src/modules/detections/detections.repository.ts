import type { SupabaseClient } from "@supabase/supabase-js";

import { AppError } from "../shared/errors.js";
import type { DetectionRecord } from "../shared/types.js";
import type { DetectionCandidate } from "../vision/detection-normalizer.js";

export type UpsertDetectionResult = {
  detection: DetectionRecord;
  isNew: boolean;
};

export async function upsertDetection(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    assetId: string;
    scanJobId: string;
    candidate: DetectionCandidate;
  },
): Promise<UpsertDetectionResult> {
  const { organizationId, assetId, scanJobId, candidate } = params;
  const now = new Date().toISOString();

  const { data: existingDetection, error: existingError } = await supabase
    .from("detections")
    .select(
      "id, organization_id, asset_id, scan_job_id, source_url, canonical_source_url, matched_image_url, canonical_matched_image_url, page_title, domain, confidence_score, vision_payload, status, first_seen_at, last_seen_at, last_scanned_at, archived_at",
    )
    .eq("organization_id", organizationId)
    .eq("asset_id", assetId)
    .eq("canonical_source_url", candidate.canonicalSourceUrl)
    .eq("canonical_matched_image_url", candidate.canonicalMatchedImageUrl)
    .maybeSingle();

  if (existingError) {
    throw new AppError(existingError.message, {
      code: "find_detection_failed",
      retryable: true,
    });
  }

  if (!existingDetection) {
    const { data, error } = await supabase
      .from("detections")
      .insert({
        organization_id: organizationId,
        asset_id: assetId,
        scan_job_id: scanJobId,
        source_url: candidate.sourceUrl,
        canonical_source_url: candidate.canonicalSourceUrl,
        matched_image_url: candidate.matchedImageUrl,
        canonical_matched_image_url: candidate.canonicalMatchedImageUrl,
        page_title: candidate.pageTitle,
        domain: candidate.domain,
        confidence_score: candidate.confidenceScore,
        vision_payload: candidate.visionPayload,
        first_seen_at: now,
        last_seen_at: now,
        last_scanned_at: now,
      })
      .select(
        "id, organization_id, asset_id, scan_job_id, source_url, canonical_source_url, matched_image_url, canonical_matched_image_url, page_title, domain, confidence_score, vision_payload, status, first_seen_at, last_seen_at, last_scanned_at, archived_at",
      )
      .single();

    if (error) {
      throw new AppError(error.message, {
        code: "insert_detection_failed",
        retryable: true,
      });
    }

    return {
      detection: data as DetectionRecord,
      isNew: true,
    };
  }

  const { data, error } = await supabase
    .from("detections")
    .update({
      scan_job_id: scanJobId,
      source_url: candidate.sourceUrl,
      matched_image_url: candidate.matchedImageUrl,
      page_title: candidate.pageTitle,
      domain: candidate.domain,
      confidence_score: candidate.confidenceScore,
      vision_payload: candidate.visionPayload,
      last_seen_at: now,
      last_scanned_at: now,
    })
    .eq("id", existingDetection.id)
    .select(
      "id, organization_id, asset_id, scan_job_id, source_url, canonical_source_url, matched_image_url, canonical_matched_image_url, page_title, domain, confidence_score, vision_payload, status, first_seen_at, last_seen_at, last_scanned_at, archived_at",
    )
    .single();

  if (error) {
    throw new AppError(error.message, {
      code: "update_detection_failed",
      retryable: true,
    });
  }

  return {
    detection: data as DetectionRecord,
    isNew: false,
  };
}

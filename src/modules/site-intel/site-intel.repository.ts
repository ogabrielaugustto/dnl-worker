import type { SupabaseClient } from "@supabase/supabase-js";

import { ConflictError, NotFoundError, AppError } from "../shared/errors.js";
import type {
  DetectionRecord,
  DetectionSiteIntelInvestigationRecord,
} from "../shared/types.js";

type DetectionForIntel = Pick<
  DetectionRecord,
  "id" | "organization_id" | "source_url" | "domain" | "status"
>;

function selectInvestigationColumns() {
  return "id, organization_id, detection_id, status, requested_at, started_at, completed_at, source_url, final_url, domain, rdap_payload, page_findings, contact_candidates, primary_email, primary_phone, primary_cnpj, primary_contact_page_url, error_message, metadata, created_at, updated_at";
}

function castInvestigationRecord(value: unknown): DetectionSiteIntelInvestigationRecord {
  return value as DetectionSiteIntelInvestigationRecord;
}

export async function getDetectionForSiteIntel(
  supabase: SupabaseClient,
  detectionId: string,
): Promise<DetectionForIntel> {
  const { data, error } = await supabase
    .from("detections")
    .select("id, organization_id, source_url, domain, status")
    .eq("id", detectionId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      code: "get_detection_for_site_intel_failed",
      retryable: true,
    });
  }

  if (!data) {
    throw new NotFoundError("Detection not found", "site_intel_detection_not_found");
  }

  return data as DetectionForIntel;
}

export async function ensureQueuedSiteIntelInvestigation(
  supabase: SupabaseClient,
  params: {
    detectionId: string;
    force: boolean;
  },
): Promise<DetectionSiteIntelInvestigationRecord> {
  const detection = await getDetectionForSiteIntel(supabase, params.detectionId);

  if (detection.status !== "unauthorized") {
    throw new ConflictError(
      "Detection must be unauthorized first",
      "site_intel_requires_unauthorized",
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from("detection_site_intel_investigations")
    .select(selectInvestigationColumns())
    .eq("detection_id", params.detectionId)
    .maybeSingle();

  if (existingError) {
    throw new AppError(existingError.message, {
      code: "get_site_intel_investigation_failed",
      retryable: true,
    });
  }

  const now = new Date().toISOString();

  if (!existing) {
    const { data, error } = await supabase
      .from("detection_site_intel_investigations")
      .insert({
        organization_id: detection.organization_id,
        detection_id: detection.id,
        status: "queued",
        requested_at: now,
        source_url: detection.source_url,
        domain: detection.domain,
      })
      .select(selectInvestigationColumns())
      .single();

    if (error) {
      throw new AppError(error.message, {
        code: "insert_site_intel_investigation_failed",
        retryable: true,
      });
    }

    return castInvestigationRecord(data);
  }

  const existingRecord = castInvestigationRecord(existing);

  if (!params.force && (existingRecord.status === "queued" || existingRecord.status === "processing")) {
    return existingRecord;
  }

  const { data, error } = await supabase
    .from("detection_site_intel_investigations")
    .update({
      status: "queued",
      requested_at: now,
      started_at: null,
      completed_at: null,
      source_url: detection.source_url,
      domain: detection.domain,
      final_url: null,
      rdap_payload: {},
      page_findings: [],
      contact_candidates: [],
      primary_email: null,
      primary_phone: null,
      primary_cnpj: null,
      primary_contact_page_url: null,
      error_message: null,
      metadata: params.force ? { forcedAt: now } : {},
    })
    .eq("id", existingRecord.id)
    .select(selectInvestigationColumns())
    .single();

  if (error) {
    throw new AppError(error.message, {
      code: "reset_site_intel_investigation_failed",
      retryable: true,
    });
  }

  return castInvestigationRecord(data);
}

export async function markSiteIntelProcessing(
  supabase: SupabaseClient,
  detectionId: string,
): Promise<DetectionSiteIntelInvestigationRecord> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("detection_site_intel_investigations")
    .update({
      status: "processing",
      started_at: now,
      completed_at: null,
      error_message: null,
    })
    .eq("detection_id", detectionId)
    .select(selectInvestigationColumns())
    .single();

  if (error) {
    throw new AppError(error.message, {
      code: "mark_site_intel_processing_failed",
      retryable: true,
    });
  }

  return castInvestigationRecord(data);
}

export async function markSiteIntelCompleted(
  supabase: SupabaseClient,
  params: {
    detectionId: string;
    finalUrl: string;
    domain: string | null;
    rdapPayload: Record<string, unknown> | null;
    pageFindings: Array<Record<string, unknown>>;
    contactCandidates: Array<Record<string, unknown>>;
    primaryEmail: string | null;
    primaryPhone: string | null;
    primaryCnpj: string | null;
    primaryContactPageUrl: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("detection_site_intel_investigations")
    .update({
      status: "completed",
      completed_at: now,
      final_url: params.finalUrl,
      domain: params.domain,
      rdap_payload: params.rdapPayload ?? {},
      page_findings: params.pageFindings,
      contact_candidates: params.contactCandidates,
      primary_email: params.primaryEmail,
      primary_phone: params.primaryPhone,
      primary_cnpj: params.primaryCnpj,
      primary_contact_page_url: params.primaryContactPageUrl,
      error_message: null,
    })
    .eq("detection_id", params.detectionId);

  if (error) {
    throw new AppError(error.message, {
      code: "mark_site_intel_completed_failed",
      retryable: true,
    });
  }
}

export async function markSiteIntelFailed(
  supabase: SupabaseClient,
  params: {
    detectionId: string;
    errorMessage: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("detection_site_intel_investigations")
    .update({
      status: "failed",
      completed_at: now,
      error_message: params.errorMessage,
    })
    .eq("detection_id", params.detectionId);

  if (error) {
    throw new AppError(error.message, {
      code: "mark_site_intel_failed_failed",
      retryable: true,
    });
  }
}

export async function markSiteIntelSkipped(
  supabase: SupabaseClient,
  params: {
    detectionId: string;
    errorMessage: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("detection_site_intel_investigations")
    .update({
      status: "skipped",
      completed_at: now,
      error_message: params.errorMessage,
    })
    .eq("detection_id", params.detectionId);

  if (error) {
    throw new AppError(error.message, {
      code: "mark_site_intel_skipped_failed",
      retryable: true,
    });
  }
}

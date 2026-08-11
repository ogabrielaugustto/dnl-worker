import type { SupabaseClient } from "@supabase/supabase-js";
import type pino from "pino";

import { getErrorMessage } from "../shared/errors.js";
import { collectPublicSiteIntel } from "./site-intel.service.js";
import {
  getDetectionForSiteIntel,
  markSiteIntelCompleted,
  markSiteIntelFailed,
  markSiteIntelProcessing,
  markSiteIntelSkipped,
} from "./site-intel.repository.js";

export async function processSiteIntelInvestigation(
  supabase: SupabaseClient,
  logger: pino.Logger,
  payload: {
    detectionId: string;
  },
): Promise<void> {
  await markSiteIntelProcessing(supabase, payload.detectionId);

  try {
    const detection = await getDetectionForSiteIntel(supabase, payload.detectionId);

    if (detection.status !== "unauthorized") {
      await markSiteIntelSkipped(supabase, {
        detectionId: payload.detectionId,
        errorMessage: "Detection is no longer unauthorized",
      });
      return;
    }

    const result = await collectPublicSiteIntel({
      sourceUrl: detection.source_url,
    });

    await markSiteIntelCompleted(supabase, {
      detectionId: payload.detectionId,
      finalUrl: result.finalUrl,
      domain: result.domain,
      registeredDomain: result.registeredDomain,
      rdapPayload: result.rdapPayload,
      rdapEntities: result.rdapEntities as Array<Record<string, unknown>>,
      pageFindings: result.pageFindings as Array<Record<string, unknown>>,
      contactCandidates: result.contactCandidates as Array<Record<string, unknown>>,
      domainOwner: result.domainOwner,
      domainOwnerCandidates: result.domainOwnerCandidates as Array<Record<string, unknown>>,
      primaryEmail: result.primaryEmail,
      primaryPhone: result.primaryPhone,
      primaryCnpj: result.primaryCnpj,
      primaryContactPageUrl: result.primaryContactPageUrl,
    });
  } catch (error) {
    const message = getErrorMessage(error);

    logger.error(
      {
        event: "site_intel_investigation_failed",
        detectionId: payload.detectionId,
        error: message,
      },
      "Site intel investigation failed",
    );

    await markSiteIntelFailed(supabase, {
      detectionId: payload.detectionId,
      errorMessage: message,
    });

    throw error;
  }
}

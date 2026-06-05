import type { SupabaseClient } from "@supabase/supabase-js";
import type pino from "pino";

import { captureScreenshot } from "./screenshot.service.js";
import {
  markEvidenceCaptured,
  markEvidenceFailed,
  markEvidenceProcessing,
} from "./evidence.repository.js";
import { uploadEvidenceScreenshot } from "../storage/r2-storage.service.js";
import { getErrorMessage } from "../shared/errors.js";

export async function processEvidenceCapture(
  supabase: SupabaseClient,
  logger: pino.Logger,
  payload: {
    organizationId: string;
    detectionId: string;
    scanRunId: string;
    sourceUrl: string;
  },
): Promise<void> {
  await markEvidenceProcessing(supabase, payload.detectionId, payload.scanRunId);

  try {
    const screenshot = await captureScreenshot(payload.sourceUrl);
    const storageKey = `organizations/${payload.organizationId}/detections/${payload.detectionId}/runs/${payload.scanRunId}/screenshot.png`;

    await uploadEvidenceScreenshot(storageKey, screenshot.buffer);

    await markEvidenceCaptured(supabase, {
      detectionId: payload.detectionId,
      scanRunId: payload.scanRunId,
      screenshotStorageKey: storageKey,
      finalUrl: screenshot.finalUrl,
      capturedAt: screenshot.capturedAt,
    });
  } catch (error) {
    const message = getErrorMessage(error);

    logger.error(
      {
        event: "evidence_capture_failed",
        detectionId: payload.detectionId,
        scanRunId: payload.scanRunId,
        error: message,
      },
      "Evidence capture failed",
    );

    await markEvidenceFailed(supabase, {
      detectionId: payload.detectionId,
      scanRunId: payload.scanRunId,
      errorMessage: message,
    });

    throw error;
  }
}

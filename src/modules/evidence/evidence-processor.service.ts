import type { SupabaseClient } from "@supabase/supabase-js";
import type pino from "pino";

import { captureScreenshot } from "./screenshot.service.js";
import { captureSiteSnapshot, downloadMatchedImage } from "./site-intel.service.js";
import {
  hasOpenEvidenceForScanRun,
  markEvidenceCaptured,
  markEvidenceFailed,
  markEvidenceProcessing,
} from "./evidence.repository.js";
import { uploadEvidenceFile, uploadEvidenceScreenshot } from "../storage/r2-storage.service.js";
import { getErrorMessage } from "../shared/errors.js";
import { finalizeEvidencePendingScanRun } from "../scans/scan-jobs.repository.js";

export async function processEvidenceCapture(
  supabase: SupabaseClient,
  logger: pino.Logger,
  payload: {
    organizationId: string;
    detectionId: string;
    scanRunId: string;
    sourceUrl: string;
    matchedImageUrl: string | null;
  },
): Promise<void> {
  await markEvidenceProcessing(supabase, payload.detectionId, payload.scanRunId);

  try {
    const [screenshot, siteSnapshot, matchedImage] = await Promise.all([
      captureScreenshot(payload.sourceUrl),
      captureSiteSnapshot(payload.sourceUrl).catch((error) => {
        logger.warn(
          {
            event: "site_snapshot_failed",
            detectionId: payload.detectionId,
            scanRunId: payload.scanRunId,
            error: getErrorMessage(error),
          },
          "Site snapshot failed",
        );

        return null;
      }),
      payload.matchedImageUrl
        ? downloadMatchedImage(payload.matchedImageUrl).catch((error) => {
            logger.warn(
              {
                event: "matched_image_download_failed",
                detectionId: payload.detectionId,
                scanRunId: payload.scanRunId,
                matchedImageUrl: payload.matchedImageUrl,
                error: getErrorMessage(error),
              },
              "Matched image download failed",
            );

            return null;
          })
        : Promise.resolve(null),
    ]);
    const storageKey = `organizations/${payload.organizationId}/detections/${payload.detectionId}/runs/${payload.scanRunId}/screenshot.png`;

    await uploadEvidenceScreenshot(storageKey, screenshot.buffer);
    let matchedImageStorageKey: string | null = null;

    if (matchedImage) {
      matchedImageStorageKey = `organizations/${payload.organizationId}/detections/${payload.detectionId}/runs/${payload.scanRunId}/matched-image`;

      await uploadEvidenceFile({
        key: matchedImageStorageKey,
        buffer: matchedImage.body,
        contentType: matchedImage.contentType,
      });
    }

    await markEvidenceCaptured(supabase, {
      detectionId: payload.detectionId,
      scanRunId: payload.scanRunId,
      screenshotStorageKey: storageKey,
      matchedImageStorageKey,
      finalUrl: screenshot.finalUrl,
      capturedAt: screenshot.capturedAt,
      metadata: {
        finalUrl: screenshot.finalUrl,
        siteSnapshot,
      },
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
  } finally {
    const hasOpenEvidence = await hasOpenEvidenceForScanRun(supabase, payload.scanRunId);

    if (!hasOpenEvidence) {
      await finalizeEvidencePendingScanRun(supabase, payload.scanRunId);
    }
  }
}

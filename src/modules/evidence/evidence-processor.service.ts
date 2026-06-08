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

type EvidenceArtifact<T> =
  | {
      status: "fulfilled";
      value: T;
    }
  | {
      status: "rejected";
      errorMessage: string;
    };

async function settleEvidenceArtifact<T>(task: Promise<T>): Promise<EvidenceArtifact<T>> {
  try {
    return {
      status: "fulfilled",
      value: await task,
    };
  } catch (error) {
    return {
      status: "rejected",
      errorMessage: getErrorMessage(error),
    };
  }
}

export async function processEvidenceCapture(
  supabase: SupabaseClient,
  logger: pino.Logger,
  payload: {
    organizationId: string;
    detectionId: string;
    scanRunId: string | null;
    evidenceRunId: string;
    sourceUrl: string;
    matchedImageUrl: string | null;
  },
): Promise<void> {
  await markEvidenceProcessing(supabase, payload.detectionId, payload.scanRunId);

  try {
    const [screenshotResult, siteSnapshotResult, matchedImageResult] = await Promise.all([
      settleEvidenceArtifact(captureScreenshot(payload.sourceUrl)),
      settleEvidenceArtifact(captureSiteSnapshot(payload.sourceUrl)),
      payload.matchedImageUrl
        ? settleEvidenceArtifact(downloadMatchedImage(payload.matchedImageUrl, payload.sourceUrl))
        : Promise.resolve({ status: "fulfilled" as const, value: null }),
    ]);

    const warnings: string[] = [];
    let screenshotStorageKey: string | null = null;

    if (screenshotResult.status === "fulfilled") {
      screenshotStorageKey = `organizations/${payload.organizationId}/detections/${payload.detectionId}/runs/${payload.evidenceRunId}/screenshot.png`;
      await uploadEvidenceScreenshot(screenshotStorageKey, screenshotResult.value.buffer);
    } else {
      warnings.push(`Screenshot da pagina nao capturado: ${screenshotResult.errorMessage}`);
      logger.warn(
        {
          event: "screenshot_capture_failed",
          detectionId: payload.detectionId,
          scanRunId: payload.scanRunId,
          error: screenshotResult.errorMessage,
        },
        "Screenshot capture failed",
      );
    }

    const siteSnapshot =
      siteSnapshotResult.status === "fulfilled" ? siteSnapshotResult.value : null;

    if (siteSnapshotResult.status === "rejected") {
      warnings.push(`Snapshot tecnico do site nao capturado: ${siteSnapshotResult.errorMessage}`);
      logger.warn(
        {
          event: "site_snapshot_failed",
          detectionId: payload.detectionId,
          scanRunId: payload.scanRunId,
          error: siteSnapshotResult.errorMessage,
        },
        "Site snapshot failed",
      );
    }

    let matchedImageStorageKey: string | null = null;

    if (matchedImageResult.status === "fulfilled" && matchedImageResult.value) {
      matchedImageStorageKey = `organizations/${payload.organizationId}/detections/${payload.detectionId}/runs/${payload.evidenceRunId}/matched-image`;

      await uploadEvidenceFile({
        key: matchedImageStorageKey,
        buffer: matchedImageResult.value.body,
        contentType: matchedImageResult.value.contentType,
      });
    } else if (matchedImageResult.status === "rejected") {
      warnings.push(`Imagem encontrada nao preservada: ${matchedImageResult.errorMessage}`);
      logger.warn(
        {
          event: "matched_image_download_failed",
          detectionId: payload.detectionId,
          scanRunId: payload.scanRunId,
          matchedImageUrl: payload.matchedImageUrl,
          error: matchedImageResult.errorMessage,
        },
        "Matched image download failed",
      );
    }

    if (!screenshotStorageKey && !matchedImageStorageKey) {
      throw new Error(warnings.join(" | ") || "No evidence artifact was captured");
    }

    const finalUrl =
      screenshotResult.status === "fulfilled" ? screenshotResult.value.finalUrl : payload.sourceUrl;
    const capturedAt =
      screenshotResult.status === "fulfilled"
        ? screenshotResult.value.capturedAt
        : new Date().toISOString();

    await markEvidenceCaptured(supabase, {
      detectionId: payload.detectionId,
      scanRunId: payload.scanRunId,
      screenshotStorageKey,
      matchedImageStorageKey,
      finalUrl,
      capturedAt,
      errorMessage: warnings.length > 0 ? warnings.join(" | ") : null,
      metadata: {
        finalUrl,
        siteSnapshot,
        captureWarnings: warnings,
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
    if (!payload.scanRunId) {
      return;
    }

    const hasOpenEvidence = await hasOpenEvidenceForScanRun(supabase, payload.scanRunId);

    if (!hasOpenEvidence) {
      await finalizeEvidencePendingScanRun(supabase, payload.scanRunId);
    }
  }
}

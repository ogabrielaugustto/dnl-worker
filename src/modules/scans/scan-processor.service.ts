import type { SupabaseClient } from "@supabase/supabase-js";
import type pino from "pino";

import {
  claimScanJob,
  completeScanJob,
  completeScanRun,
  createScanRun,
  failScanRun,
  getAssetWithPrimaryFile,
  releaseScanJobForRetry,
} from "./scan-jobs.repository.js";
import { upsertDetection } from "../detections/detections.repository.js";
import {
  getLatestDetectionEvidence,
  upsertPendingDetectionEvidence,
} from "../evidence/evidence.repository.js";
import type { QueueManager } from "../jobs/queues.js";
import { normalizeVisionDetections } from "../vision/detection-normalizer.js";
import {
  detectImageOnWeb,
  VisionConfigurationError,
} from "../vision/vision.service.js";
import { AppError, getErrorMessage, isRetryableError } from "../shared/errors.js";

export async function processScanJob(
  supabase: SupabaseClient,
  queueManager: QueueManager,
  logger: pino.Logger,
  workerId: string,
  scanJobId: string,
): Promise<void> {
  const claimedJob = await claimScanJob(supabase, scanJobId, workerId);
  const scanRun = await createScanRun(supabase, claimedJob, workerId);

  try {
    const asset = await getAssetWithPrimaryFile(
      supabase,
      claimedJob.organization_id,
      claimedJob.asset_id,
    );
    const primaryFile = asset.asset_files.find((file) => file.is_primary);

    if (!primaryFile?.public_url) {
      throw new AppError("Primary asset file is missing public_url", {
        code: "asset_public_url_missing",
        retryable: false,
      });
    }

    const visionResult = await detectImageOnWeb(primaryFile.public_url);
    const candidates = normalizeVisionDetections(visionResult);

    let evidenceJobsQueued = 0;
    let newDetections = 0;
    let updatedDetections = 0;

    for (const candidate of candidates) {
      const upserted = await upsertDetection(supabase, {
        organizationId: claimedJob.organization_id,
        assetId: claimedJob.asset_id,
        scanJobId: claimedJob.id,
        candidate,
      });

      if (upserted.isNew) {
        newDetections += 1;
      } else {
        updatedDetections += 1;
      }

      const latestEvidence = await getLatestDetectionEvidence(supabase, upserted.detection.id);
      const shouldCaptureEvidence =
        upserted.isNew ||
        !latestEvidence ||
        latestEvidence.capture_status !== "captured" ||
        !latestEvidence.screenshot_storage_key;

      if (shouldCaptureEvidence) {
        await upsertPendingDetectionEvidence(supabase, {
          organizationId: claimedJob.organization_id,
          detectionId: upserted.detection.id,
          scanRunId: scanRun.id,
          sourceUrl: upserted.detection.source_url,
        });

        await queueManager.enqueueEvidenceJob({
          organizationId: claimedJob.organization_id,
          detectionId: upserted.detection.id,
          scanRunId: scanRun.id,
          sourceUrl: upserted.detection.source_url,
        });

        evidenceJobsQueued += 1;
      }
    }

    await completeScanRun(
      supabase,
      scanRun.id,
      scanRun.started_at,
      evidenceJobsQueued > 0 ? "evidence_pending" : "completed",
      {
        candidatesCount: candidates.length,
        newDetections,
        updatedDetections,
        evidenceJobsQueued,
      },
    );
    await completeScanJob(supabase, claimedJob.id, scanRun.id);

    logger.info(
      {
        event: "scan_job_completed",
        scanJobId: claimedJob.id,
        scanRunId: scanRun.id,
        candidatesCount: candidates.length,
        newDetections,
        updatedDetections,
        evidenceJobsQueued,
      },
      "Scan job completed",
    );
  } catch (error) {
    const errorCode =
      error instanceof AppError
        ? error.code
        : error instanceof VisionConfigurationError
          ? "vision_configuration_error"
          : "scan_job_failed";
    const errorMessage = getErrorMessage(error);
    const retryable = isRetryableError(error);

    await failScanRun(supabase, scanRun.id, scanRun.started_at, errorCode, errorMessage, {
      retryable,
    });
    await releaseScanJobForRetry(supabase, claimedJob, errorCode, errorMessage);

    logger.error(
      {
        event: "scan_job_failed",
        scanJobId: claimedJob.id,
        scanRunId: scanRun.id,
        errorCode,
        retryable,
      },
      "Scan job failed",
    );

    throw error;
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type pino from "pino";

import type { WaybackQueuePayload } from "../jobs/queues.js";
import { getErrorMessage, isRetryableError } from "../shared/errors.js";
import {
  completeWaybackCapture,
  failWaybackCapture,
  markWaybackCaptureProcessing,
} from "./wayback.repository.js";
import { archiveUrlInWayback } from "./wayback.service.js";

export async function processWaybackCapture(
  supabase: SupabaseClient,
  logger: pino.Logger,
  payload: WaybackQueuePayload,
): Promise<void> {
  await markWaybackCaptureProcessing(supabase, payload.detectionId);

  try {
    const result = await archiveUrlInWayback(payload.sourceUrl);
    const hasSnapshot = Boolean(result.latestSnapshotUrl && result.latestSnapshotTimestamp);

    const captureStatus =
      result.jobStatus === "success" || hasSnapshot
        ? "captured"
        : result.jobStatus === "pending" || result.saveJobId
          ? "submitted"
          : "unavailable";

    await completeWaybackCapture(supabase, {
      detectionId: payload.detectionId,
      captureStatus,
      saveJobId: result.saveJobId,
      saveHttpStatus: result.saveHttpStatus,
      latestSnapshotUrl: result.latestSnapshotUrl,
      latestSnapshotTimestamp: result.latestSnapshotTimestamp,
      latestSnapshotAt: result.latestSnapshotAt,
      latestSnapshotStatus: result.latestSnapshotStatus,
      timeline: result.timeline,
      metadata: {
        requestUrl: result.requestUrl,
        jobStatus: result.jobStatus,
        jobStatusDetail: result.jobStatusDetail,
        rawAvailability: result.rawAvailability,
        rawSaveStatus: result.rawSaveStatus,
      },
      errorMessage: captureStatus === "unavailable" ? "Wayback did not confirm a snapshot yet" : null,
    });

    logger.info(
      {
        event: "wayback_capture_completed",
        detectionId: payload.detectionId,
        scanRunId: payload.scanRunId,
        status: captureStatus,
        saveJobId: result.saveJobId,
        latestSnapshotTimestamp: result.latestSnapshotTimestamp,
      },
      "Wayback capture completed",
    );
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    await failWaybackCapture(supabase, {
      detectionId: payload.detectionId,
      saveJobId: null,
      saveHttpStatus: null,
      errorMessage,
      metadata: {
        requestUrl: payload.sourceUrl,
        retryable: isRetryableError(error),
      },
    });

    logger.error(
      {
        event: "wayback_capture_failed",
        detectionId: payload.detectionId,
        scanRunId: payload.scanRunId,
        retryable: isRetryableError(error),
      },
      "Wayback capture failed",
    );

    throw error;
  }
}

import { Queue, Worker, type JobsOptions } from "bullmq";
import type pino from "pino";

import { env } from "../../config/env.js";
import type { WorkerMetrics } from "./metrics.js";
import { buildEvidenceJobId } from "./job-keys.js";
import { getErrorMessage } from "../shared/errors.js";

export const SCAN_JOBS_QUEUE_NAME = "scan-jobs";
export const CAPTURE_EVIDENCE_QUEUE_NAME = "capture-evidence";

export type ScanQueuePayload = {
  scanJobId: string;
};

export type EvidenceQueuePayload = {
  organizationId: string;
  detectionId: string;
  scanRunId: string;
  sourceUrl: string;
  matchedImageUrl: string | null;
};

type QueueManagerOptions = {
  logger: pino.Logger;
  metrics: WorkerMetrics;
  processScanJob: (payload: ScanQueuePayload) => Promise<void>;
  processEvidenceJob: (payload: EvidenceQueuePayload) => Promise<void>;
};

const bullConnection = {
  url: env.REDIS_URL,
};

export class QueueManager {
  private readonly scanQueue = new Queue<ScanQueuePayload>(SCAN_JOBS_QUEUE_NAME, {
    connection: bullConnection,
  });

  private readonly evidenceQueue = new Queue<EvidenceQueuePayload>(CAPTURE_EVIDENCE_QUEUE_NAME, {
    connection: bullConnection,
  });

  private readonly scanWorker: Worker<ScanQueuePayload>;
  private readonly evidenceWorker: Worker<EvidenceQueuePayload>;

  constructor(private readonly options: QueueManagerOptions) {
    this.scanWorker = new Worker<ScanQueuePayload>(
      SCAN_JOBS_QUEUE_NAME,
      async (job) => {
        await options.processScanJob(job.data);
        options.metrics.recordScanJobProcessed();
      },
      {
        connection: bullConnection,
        concurrency: 2,
        limiter: {
          max: env.VISION_RATE_LIMIT_PER_MINUTE,
          duration: 60_000,
        },
      },
    );

    this.evidenceWorker = new Worker<EvidenceQueuePayload>(
      CAPTURE_EVIDENCE_QUEUE_NAME,
      async (job) => {
        await options.processEvidenceJob(job.data);
        options.metrics.recordEvidenceJobProcessed();
      },
      {
        connection: bullConnection,
        concurrency: env.SCREENSHOT_CONCURRENCY,
      },
    );

    this.scanWorker.on("failed", (_job, error) => {
      options.metrics.recordScanJobFailed();
      options.logger.error(
        {
          event: "scan_worker_failed",
          error: getErrorMessage(error),
        },
        "Scan worker failed",
      );
    });

    this.evidenceWorker.on("failed", (_job, error) => {
      options.metrics.recordEvidenceJobFailed();
      options.logger.error(
        {
          event: "evidence_worker_failed",
          error: getErrorMessage(error),
        },
        "Evidence worker failed",
      );
    });
  }

  async enqueueScanJob(payload: ScanQueuePayload, options?: JobsOptions): Promise<void> {
    await this.scanQueue.add("scan-job", payload, {
      jobId: payload.scanJobId,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5_000,
      },
      removeOnComplete: 500,
      removeOnFail: 500,
      ...options,
    });

    this.options.metrics.recordScanJobEnqueued();
  }

  async enqueueEvidenceJob(payload: EvidenceQueuePayload): Promise<void> {
    await this.evidenceQueue.add("capture-evidence", payload, {
      jobId: buildEvidenceJobId(payload.detectionId, payload.scanRunId),
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 10_000,
      },
      removeOnComplete: 500,
      removeOnFail: 500,
    });

    this.options.metrics.recordEvidenceJobEnqueued();
  }

  async getQueueStats(): Promise<Record<string, unknown>> {
    const [scanCounts, evidenceCounts] = await Promise.all([
      this.scanQueue.getJobCounts("active", "completed", "delayed", "failed", "waiting"),
      this.evidenceQueue.getJobCounts("active", "completed", "delayed", "failed", "waiting"),
    ]);

    return {
      [SCAN_JOBS_QUEUE_NAME]: scanCounts,
      [CAPTURE_EVIDENCE_QUEUE_NAME]: evidenceCounts,
    };
  }

  async close(): Promise<void> {
    await Promise.all([
      this.scanWorker.close(),
      this.evidenceWorker.close(),
      this.scanQueue.close(),
      this.evidenceQueue.close(),
    ]);
  }
}

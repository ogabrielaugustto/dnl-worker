import type pino from "pino";

import { env } from "../../config/env.js";
import { getRedisConnection } from "../../config/redis.js";
import { getSupabaseAdminClient } from "../../config/supabase.js";
import { enqueuePendingScanJobs, runSchedulerCycle } from "../scheduler/scheduler.service.js";
import { processScanJob as processScanJobService } from "../scans/scan-processor.service.js";
import { processEvidenceCapture } from "../evidence/evidence-processor.service.js";
import { processWaybackCapture } from "../wayback/wayback-processor.service.js";
import { QueueManager } from "./queues.js";
import { WorkerMetrics } from "./metrics.js";
import { getScanJobById } from "../scans/scan-jobs.repository.js";

export class WorkerRuntime {
  private readonly supabase = getSupabaseAdminClient();
  private readonly redis = getRedisConnection();
  private readonly metrics = new WorkerMetrics();
  private readonly queueManager: QueueManager;
  private schedulerTimer: NodeJS.Timeout | null = null;

  constructor(private readonly logger: pino.Logger) {
    this.queueManager = new QueueManager({
      logger,
      metrics: this.metrics,
      processScanJob: async ({ scanJobId }) => {
        await processScanJobService(
          this.supabase,
          this.queueManager,
          this.logger,
          env.WORKER_ID,
          scanJobId,
        );
      },
      processEvidenceJob: async (payload) => {
        await processEvidenceCapture(this.supabase, this.logger, payload);
      },
      processWaybackJob: async (payload) => {
        await processWaybackCapture(this.supabase, this.logger, payload);
      },
    });
  }

  async start(): Promise<void> {
    await this.enqueuePendingJobs();
    this.schedulerTimer = setInterval(async () => {
      try {
        await this.runScheduler();
      } catch (error) {
        this.logger.error(
          {
            event: "scheduler_cycle_failed",
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "Scheduler cycle failed",
        );
      }
    }, env.SCHEDULER_INTERVAL_SECONDS * 1000);
  }

  async stop(): Promise<void> {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }

    await this.queueManager.close();
    await this.redis.quit();
  }

  async runScheduler(): Promise<{
    scheduledCount: number;
    enqueuedCount: number;
  }> {
    return runSchedulerCycle(this.supabase, this.queueManager, this.logger, this.metrics);
  }

  async enqueuePendingJobs(): Promise<number> {
    return enqueuePendingScanJobs(this.supabase, this.queueManager);
  }

  async enqueueSpecificJob(scanJobId: string): Promise<void> {
    const scanJob = await getScanJobById(this.supabase, scanJobId);

    await this.queueManager.enqueueScanJob(
      { scanJobId },
      {
        jobId: scanJobId,
        priority: scanJob.priority,
      },
    );
  }

  async getHealth(): Promise<Record<string, unknown>> {
    const [redisStatus, supabaseStatus] = await Promise.all([
      this.checkRedisHealth(),
      this.checkSupabaseHealth(),
    ]);

    return {
      ok: redisStatus.ok && supabaseStatus.ok,
      service: "dnl-worker",
      timestamp: new Date().toISOString(),
      dependencies: {
        redis: redisStatus,
        supabase: supabaseStatus,
      },
    };
  }

  async getMetrics(): Promise<Record<string, unknown>> {
    return {
      runtime: this.metrics.snapshot(),
      queues: await this.queueManager.getQueueStats(),
    };
  }

  private async checkRedisHealth(): Promise<{ ok: boolean; status: string }> {
    try {
      const pong = await this.redis.ping();
      return {
        ok: pong === "PONG",
        status: pong,
      };
    } catch (error) {
      return {
        ok: false,
        status: error instanceof Error ? error.message : "Redis ping failed",
      };
    }
  }

  private async checkSupabaseHealth(): Promise<{ ok: boolean; status: string }> {
    try {
      const { error } = await this.supabase
        .from("subscription_plans")
        .select("id", { count: "exact", head: true });

      return {
        ok: !error,
        status: error ? error.message : "ok",
      };
    } catch (error) {
      return {
        ok: false,
        status: error instanceof Error ? error.message : "Supabase health check failed",
      };
    }
  }
}

import type pino from "pino";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { QueueManager } from "../jobs/queues.js";
import type { WorkerMetrics } from "../jobs/metrics.js";
import { listPendingScanJobs, scheduleDueScanJobs } from "../scans/scan-jobs.repository.js";

export async function runSchedulerCycle(
  supabase: SupabaseClient,
  queueManager: QueueManager,
  logger: pino.Logger,
  metrics: WorkerMetrics,
): Promise<{
  scheduledCount: number;
  enqueuedCount: number;
} > {
  const scheduledJobs = await scheduleDueScanJobs(supabase);

  for (const scheduledJob of scheduledJobs) {
    await queueManager.enqueueScanJob({ scanJobId: scheduledJob.scan_job_id }, {
      jobId: scheduledJob.scan_job_id,
      priority: scheduledJob.priority,
    });
  }

  metrics.recordSchedulerRun(scheduledJobs.length);

  logger.info(
    {
      event: "scheduler_cycle_completed",
      scheduledCount: scheduledJobs.length,
    },
    "Scheduler cycle completed",
  );

  return {
    scheduledCount: scheduledJobs.length,
    enqueuedCount: scheduledJobs.length,
  };
}

export async function enqueuePendingScanJobs(
  supabase: SupabaseClient,
  queueManager: QueueManager,
): Promise<number> {
  const pendingJobs = await listPendingScanJobs(supabase);

  for (const pendingJob of pendingJobs) {
    await queueManager.enqueueScanJob(
      { scanJobId: pendingJob.id },
      {
        jobId: pendingJob.id,
        priority: pendingJob.priority,
      },
    );
  }

  return pendingJobs.length;
}

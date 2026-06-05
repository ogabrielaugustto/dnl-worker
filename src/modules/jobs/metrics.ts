export type WorkerMetricsSnapshot = {
  schedulerRuns: number;
  jobsScheduled: number;
  scanJobsEnqueued: number;
  scanJobsProcessed: number;
  scanJobsFailed: number;
  evidenceJobsEnqueued: number;
  evidenceJobsProcessed: number;
  evidenceJobsFailed: number;
  lastSchedulerRunAt: string | null;
};

export class WorkerMetrics {
  private schedulerRuns = 0;
  private jobsScheduled = 0;
  private scanJobsEnqueued = 0;
  private scanJobsProcessed = 0;
  private scanJobsFailed = 0;
  private evidenceJobsEnqueued = 0;
  private evidenceJobsProcessed = 0;
  private evidenceJobsFailed = 0;
  private lastSchedulerRunAt: string | null = null;

  recordSchedulerRun(scheduledJobsCount: number): void {
    this.schedulerRuns += 1;
    this.jobsScheduled += scheduledJobsCount;
    this.lastSchedulerRunAt = new Date().toISOString();
  }

  recordScanJobEnqueued(): void {
    this.scanJobsEnqueued += 1;
  }

  recordScanJobProcessed(): void {
    this.scanJobsProcessed += 1;
  }

  recordScanJobFailed(): void {
    this.scanJobsFailed += 1;
  }

  recordEvidenceJobEnqueued(): void {
    this.evidenceJobsEnqueued += 1;
  }

  recordEvidenceJobProcessed(): void {
    this.evidenceJobsProcessed += 1;
  }

  recordEvidenceJobFailed(): void {
    this.evidenceJobsFailed += 1;
  }

  snapshot(): WorkerMetricsSnapshot {
    return {
      schedulerRuns: this.schedulerRuns,
      jobsScheduled: this.jobsScheduled,
      scanJobsEnqueued: this.scanJobsEnqueued,
      scanJobsProcessed: this.scanJobsProcessed,
      scanJobsFailed: this.scanJobsFailed,
      evidenceJobsEnqueued: this.evidenceJobsEnqueued,
      evidenceJobsProcessed: this.evidenceJobsProcessed,
      evidenceJobsFailed: this.evidenceJobsFailed,
      lastSchedulerRunAt: this.lastSchedulerRunAt,
    };
  }
}

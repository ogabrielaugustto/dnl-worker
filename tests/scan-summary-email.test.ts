import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.INTERNAL_API_SECRET = "test-secret";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.R2_ACCOUNT_ID = "test-account";
process.env.R2_ACCESS_KEY_ID = "test-access-key";
process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
process.env.R2_BUCKET_ASSETS = "test-assets";
process.env.R2_BUCKET_EVIDENCE = "test-evidence";
process.env.PLATFORM_URL = "https://app.example.com";
process.env.RESEND_API_KEY = "re_test_key";
process.env.RESEND_FROM_EMAIL = "noreply@example.com";

const {
  buildScanSummaryEmail,
  maybeSendCompletedScanSummaryEmail,
} = await import("../src/modules/scans/scan-summary-email.service.ts");

test("buildScanSummaryEmail renders monitoring totals and a platform CTA", () => {
  const email = buildScanSummaryEmail({
    organizationName: "Studio Exemplo",
    assetTitle: "Campanha Inverno",
    scanFinishedAt: "2026-06-30T12:30:00.000Z",
    candidatesCount: 12,
    newDetections: 4,
    updatedDetections: 3,
    dashboardUrl: "https://app.example.com/detections?asset=asset-123",
  });

  assert.match(email.subject, /Campanha Inverno/);
  assert.match(email.html, /12/);
  assert.match(email.html, /4/);
  assert.match(email.html, /3/);
  assert.match(email.html, /Studio Exemplo/);
  assert.match(email.text, /https:\/\/app\.example\.com\/detections\?asset=asset-123/);
});

test("maybeSendCompletedScanSummaryEmail sends once and marks the job after success", async () => {
  const sentMessages: Array<{ to: string[]; subject: string }> = [];
  const markedJobs: string[] = [];

  await maybeSendCompletedScanSummaryEmail({
    logger: {
      error() {},
      info() {},
      warn() {},
    },
    loadSummary: async () => ({
      scanJobId: "job-1",
      recipients: [
        { email: "ana@example.com", fullName: "Ana" },
        { email: "bia@example.com", fullName: "Bia" },
      ],
      organizationName: "Studio Exemplo",
      assetId: "asset-123",
      assetTitle: "Campanha Inverno",
      scanFinishedAt: "2026-06-30T12:30:00.000Z",
      candidatesCount: 12,
      newDetections: 4,
      updatedDetections: 3,
      status: "completed",
      alreadySentAt: null,
    }),
    markSent: async (scanJobId) => {
      markedJobs.push(scanJobId);
    },
    sendEmail: async (message) => {
      sentMessages.push({
        to: Array.isArray(message.to) ? message.to : [message.to],
        subject: message.subject,
      });
    },
  });

  assert.equal(sentMessages.length, 1);
  assert.deepEqual(sentMessages[0]?.to, ["ana@example.com", "bia@example.com"]);
  assert.equal(markedJobs[0], "job-1");
});

test("maybeSendCompletedScanSummaryEmail does not mark the job when sending fails", async () => {
  const markedJobs: string[] = [];
  const loggerEvents: string[] = [];

  await assert.rejects(() =>
    maybeSendCompletedScanSummaryEmail({
      logger: {
        error(payload) {
          loggerEvents.push(String((payload as { event?: string }).event ?? ""));
        },
        info() {},
        warn() {},
      },
      loadSummary: async () => ({
        scanJobId: "job-2",
        recipients: [{ email: "ana@example.com", fullName: "Ana" }],
        organizationName: "Studio Exemplo",
        assetId: "asset-123",
        assetTitle: "Campanha Inverno",
        scanFinishedAt: "2026-06-30T12:30:00.000Z",
        candidatesCount: 12,
        newDetections: 4,
        updatedDetections: 3,
        status: "completed",
        alreadySentAt: null,
      }),
      markSent: async (scanJobId) => {
        markedJobs.push(scanJobId);
      },
      sendEmail: async () => {
        throw new Error("resend down");
      },
    }),
  );

  assert.deepEqual(markedJobs, []);
  assert.deepEqual(loggerEvents, ["scan_summary_email_failed"]);
});

test("maybeSendCompletedScanSummaryEmail skips jobs that were already delivered", async () => {
  const sentMessages: string[] = [];
  const markedJobs: string[] = [];

  await maybeSendCompletedScanSummaryEmail({
    logger: {
      error() {},
      info() {},
      warn() {},
    },
    loadSummary: async () => ({
      scanJobId: "job-3",
      recipients: [{ email: "ana@example.com", fullName: "Ana" }],
      organizationName: "Studio Exemplo",
      assetId: "asset-123",
      assetTitle: "Campanha Inverno",
      scanFinishedAt: "2026-06-30T12:30:00.000Z",
      candidatesCount: 12,
      newDetections: 4,
      updatedDetections: 3,
      status: "completed",
      alreadySentAt: "2026-06-30T12:35:00.000Z",
    }),
    markSent: async (scanJobId) => {
      markedJobs.push(scanJobId);
    },
    sendEmail: async (message) => {
      sentMessages.push(message.subject);
    },
  });

  assert.deepEqual(sentMessages, []);
  assert.deepEqual(markedJobs, []);
});

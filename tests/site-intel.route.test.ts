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

const { buildServer } = await import("../src/http/server.ts");
const { ConflictError } = await import("../src/modules/shared/errors.ts");
const detectionId = "11111111-1111-4111-8111-111111111111";

test("site-intel route requires x-internal-secret", async (t) => {
  const server = await buildServer({
    enqueuePendingJobs: async () => 0,
    enqueueSpecificJob: async () => undefined,
    enqueueSiteIntelInvestigation: async () => ({ status: "queued" }),
    getHealth: async () => ({ ok: true }),
    getMetrics: async () => ({}),
    runScheduler: async () => ({ scheduledCount: 0, enqueuedCount: 0 }),
  } as never);

  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: `/internal/site-intel/${detectionId}/run`,
  });

  assert.equal(response.statusCode, 401);
});

test("site-intel route forwards force=true and returns 202", async (t) => {
  const calls: Array<{ detectionId: string; force: boolean }> = [];
  const server = await buildServer({
    enqueuePendingJobs: async () => 0,
    enqueueSpecificJob: async () => undefined,
    enqueueSiteIntelInvestigation: async (detectionId: string, force: boolean) => {
      calls.push({ detectionId, force });
      return { status: "queued" as const };
    },
    getHealth: async () => ({ ok: true }),
    getMetrics: async () => ({}),
    runScheduler: async () => ({ scheduledCount: 0, enqueuedCount: 0 }),
  } as never);

  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: `/internal/site-intel/${detectionId}/run`,
    headers: {
      "x-internal-secret": "test-secret",
      "content-type": "application/json",
    },
    payload: {
      force: true,
    },
  });

  assert.equal(response.statusCode, 202);
  assert.deepEqual(calls, [
    {
      detectionId,
      force: true,
    },
  ]);
  assert.deepEqual(response.json(), {
    ok: true,
    detectionId,
    status: "queued",
  });
});

test("site-intel route maps unauthorized-status conflicts to 409", async (t) => {
  const server = await buildServer({
    enqueuePendingJobs: async () => 0,
    enqueueSpecificJob: async () => undefined,
    enqueueSiteIntelInvestigation: async () => {
      throw new ConflictError("Detection must be unauthorized first", "site_intel_requires_unauthorized");
    },
    getHealth: async () => ({ ok: true }),
    getMetrics: async () => ({}),
    runScheduler: async () => ({ scheduledCount: 0, enqueuedCount: 0 }),
  } as never);

  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: `/internal/site-intel/${detectionId}/run`,
    headers: {
      "x-internal-secret": "test-secret",
    },
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    ok: false,
    message: "Detection must be unauthorized first",
    code: "site_intel_requires_unauthorized",
  });
});

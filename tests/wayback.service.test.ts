import test from "node:test";
import assert from "node:assert/strict";

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

const { archiveUrlInWayback } = await import("../src/modules/wayback/wayback.service.ts");

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

test.after(() => {
  globalThis.fetch = originalFetch;
});

test("falls back to availability and timeline when Wayback status polling returns 401", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);

    if (url === "https://web.archive.org/save") {
      return new Response('<script>spn.watchJob("job-123")</script>', {
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      });
    }

    if (url === "https://web.archive.org/save/status/job-123") {
      return new Response("", {
        status: 401,
        headers: {
          "content-type": "application/json",
        },
      });
    }

    if (url === "https://archive.org/wayback/available?url=https%3A%2F%2Fexample.com") {
      return jsonResponse({
        archived_snapshots: {
          closest: {
            available: true,
            url: "http://web.archive.org/web/20260623064916/https://example.com/",
            timestamp: "20260623064916",
            status: "200",
          },
        },
      });
    }

    if (url.startsWith("https://web.archive.org/cdx/search/cdx?")) {
      return jsonResponse([
        ["timestamp", "original", "statuscode", "digest"],
        ["20260623064916", "https://example.com/", "200", "abc123"],
      ]);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const result = await archiveUrlInWayback("https://example.com");

  assert.equal(result.saveHttpStatus, 200);
  assert.equal(result.saveJobId, "job-123");
  assert.equal(result.rawSaveStatus, null);
  assert.equal(result.jobStatus, null);
  assert.equal(result.jobStatusDetail, "Wayback status request failed (401)");
  assert.equal(
    result.latestSnapshotUrl,
    "http://web.archive.org/web/20260623064916/https://example.com/",
  );
  assert.equal(result.latestSnapshotTimestamp, "20260623064916");
  assert.equal(result.timeline.length, 1);
});

test("records save rate limiting as best-effort instead of throwing", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);

    if (url === "https://web.archive.org/save") {
      return new Response("", {
        status: 429,
        headers: {
          "content-type": "text/html",
        },
      });
    }

    if (url === "https://archive.org/wayback/available?url=https%3A%2F%2Frate-limited.example") {
      return jsonResponse({});
    }

    if (url.startsWith("https://web.archive.org/cdx/search/cdx?")) {
      return jsonResponse([["timestamp", "original", "statuscode", "digest"]]);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const result = await archiveUrlInWayback("https://rate-limited.example");

  assert.equal(result.saveHttpStatus, 429);
  assert.equal(result.saveJobId, null);
  assert.equal(result.jobStatus, null);
  assert.equal(result.jobStatusDetail, "Wayback Save Page Now request failed (429)");
  assert.equal(result.latestSnapshotUrl, null);
  assert.equal(result.latestSnapshotTimestamp, null);
  assert.deepEqual(result.timeline, []);
});

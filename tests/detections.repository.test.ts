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

const { upsertDetection } = await import("../src/modules/detections/detections.repository.ts");

type QueryResponse = {
  data: unknown;
  error: { message: string } | null;
};

class SupabaseStub {
  public insertPayload: Record<string, unknown> | null = null;
  public updatePayload: Record<string, unknown> | null = null;

  constructor(
    private readonly handlers: {
      select: QueryResponse;
      insert?: QueryResponse;
      update?: QueryResponse;
    },
  ) {}

  from() {
    const parent = this;

    return {
      select() {
        return {
          eq() {
            return this;
          },
          maybeSingle: async () => parent.handlers.select,
        };
      },
      insert(payload: Record<string, unknown>) {
        parent.insertPayload = payload;

        return {
          select() {
            return {
              single: async () => parent.handlers.insert ?? { data: payload, error: null },
            };
          },
        };
      },
      update(payload: Record<string, unknown>) {
        parent.updatePayload = payload;

        return {
          eq() {
            return {
              select() {
                return {
                  single: async () => parent.handlers.update ?? { data: payload, error: null },
                };
              },
            };
          },
        };
      },
    };
  }
}

test("persists source scope fields when inserting a new detection", async () => {
  const supabase = new SupabaseStub({
    select: { data: null, error: null },
  });

  await upsertDetection(supabase as never, {
    organizationId: "org-1",
    assetId: "asset-1",
    scanJobId: "job-1",
    candidate: {
      sourceUrl: "https://portal.gov.br/noticia",
      canonicalSourceUrl: "https://portal.gov.br/noticia",
      matchedImageUrl: "https://portal.gov.br/img.jpg",
      canonicalMatchedImageUrl: "https://portal.gov.br/img.jpg",
      pageTitle: "Portal",
      domain: "portal.gov.br",
      confidenceScore: 0.97,
      sourceScope: "national",
      sourceScopeConfidence: 1,
      visionPayload: {},
      matchType: "full",
    },
  });

  assert.equal(supabase.insertPayload?.source_scope, "national");
  assert.equal(supabase.insertPayload?.source_scope_confidence, 1);
});

test("persists source scope fields when updating an existing detection", async () => {
  const supabase = new SupabaseStub({
    select: {
      data: {
        id: "det-1",
      },
      error: null,
    },
  });

  await upsertDetection(supabase as never, {
    organizationId: "org-1",
    assetId: "asset-1",
    scanJobId: "job-2",
    candidate: {
      sourceUrl: "https://example.com/post",
      canonicalSourceUrl: "https://example.com/post",
      matchedImageUrl: null,
      canonicalMatchedImageUrl: "",
      pageTitle: "Example",
      domain: "example.com",
      confidenceScore: 0.95,
      sourceScope: "international",
      sourceScopeConfidence: 0.8,
      visionPayload: {},
      matchType: "page",
    },
  });

  assert.equal(supabase.updatePayload?.source_scope, "international");
  assert.equal(supabase.updatePayload?.source_scope_confidence, 0.8);
});

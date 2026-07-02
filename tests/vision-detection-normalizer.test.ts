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
process.env.VISION_MIN_CONFIDENCE_SCORE = "0.9";
process.env.VISION_PARTIAL_MATCH_MIN_CONFIDENCE_SCORE = "0.95";
process.env.VISION_PAGE_MATCH_MIN_CONFIDENCE_SCORE = "0.97";

const { normalizeVisionDetections } = await import(
  "../src/modules/vision/detection-normalizer.ts"
);

test("classifies Brazilian candidates as national, keeps international ones, and sorts national first", () => {
  const result = normalizeVisionDetections({
    webEntities: [{ score: 0.96 }],
    pagesWithMatchingImages: [
      {
        url: "https://example.com/article?lang=en",
        pageTitle: "International article",
        partialMatchingImages: [{ url: "https://cdn.example.com/international.jpg" }],
      },
      {
        url: "https://portal.gov.br/noticia?lang=pt-BR",
        pageTitle: "Conteudo oficial brasileiro",
        partialMatchingImages: [{ url: "https://cdn.portal.gov.br/evidence.jpg" }],
      },
    ],
    fullMatchingImages: [],
    partialMatchingImages: [],
    visuallySimilarImages: [],
    raw: {},
  });

  assert.equal(result.length, 2);
  assert.equal(result[0]?.domain, "portal.gov.br");
  assert.equal(result[0]?.sourceScope, "national");
  assert.equal(result[0]?.sourceScopeConfidence, 1);
  assert.equal(result[1]?.domain, "example.com");
  assert.equal(result[1]?.sourceScope, "international");
  assert.equal(
    (result[0]?.visionPayload.sourceScopeSignals as string[]).includes("tld:gov.br"),
    true,
  );
});

test("rejects weak partial and page-only matches below the refined thresholds", () => {
  const result = normalizeVisionDetections({
    webEntities: [{ score: 0.94 }],
    pagesWithMatchingImages: [
      {
        url: "https://international.example/partial",
        pageTitle: "Partial below threshold",
        partialMatchingImages: [{ url: "https://international.example/img.jpg" }],
      },
      {
        url: "https://news.example/page-only",
        pageTitle: "Page only below threshold",
      },
      {
        url: "https://match.example/full",
        pageTitle: "Strong full match",
        fullMatchingImages: [{ url: "https://match.example/original.jpg" }],
      },
    ],
    fullMatchingImages: [],
    partialMatchingImages: [],
    visuallySimilarImages: [],
    raw: {},
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.matchType, "full");
  assert.equal(result[0]?.canonicalSourceUrl, "https://match.example/full");
});

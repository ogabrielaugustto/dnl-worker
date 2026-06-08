import type { WebDetectionResult } from "./vision.service.js";
import { canonicalizeUrl, extractDomain } from "../shared/url.js";

export type DetectionCandidate = {
  sourceUrl: string;
  canonicalSourceUrl: string;
  matchedImageUrl: string | null;
  canonicalMatchedImageUrl: string;
  pageTitle: string | null;
  domain: string | null;
  confidenceScore: number | null;
  matchType: "full" | "partial" | "page" | "perceptual_hash";
  visionPayload: Record<string, unknown>;
};

type VisionPage = {
  url?: string | null;
  pageTitle?: string | null;
  fullMatchingImages?: Array<{ url?: string | null }>;
  partialMatchingImages?: Array<{ url?: string | null }>;
};

const MIN_CONFIDENCE_SCORE = 0.9;

function normalizeConfidenceScore(score: number | null): number | null {
  if (score === null || Number.isNaN(score)) {
    return null;
  }

  if (score < 0) {
    return 0;
  }

  if (score > 1) {
    return 1;
  }

  return score;
}

function buildCandidate(
  page: VisionPage,
  matchedImageUrl: string | null,
  matchType: DetectionCandidate["matchType"],
  confidenceScore: number | null,
): DetectionCandidate | null {
  if (!page.url) {
    return null;
  }

  const canonicalSourceUrl = canonicalizeUrl(page.url);
  const canonicalMatchedImageUrl = canonicalizeUrl(matchedImageUrl);

  if (!canonicalSourceUrl) {
    return null;
  }

  return {
    sourceUrl: page.url,
    canonicalSourceUrl,
    matchedImageUrl,
    canonicalMatchedImageUrl,
    pageTitle: page.pageTitle ?? null,
    domain: extractDomain(page.url),
    confidenceScore,
    matchType,
    visionPayload: {
      page,
      matchedImageUrl,
      matchType,
      minimumConfidenceScore: MIN_CONFIDENCE_SCORE,
    },
  };
}

function resolveCandidateConfidenceScore(params: {
  matchType: DetectionCandidate["matchType"];
  pageConfidence: number | null;
}) {
  if (params.matchType === "full") {
    return 1;
  }

  if (params.matchType === "partial") {
    return normalizeConfidenceScore(params.pageConfidence ?? 0.89);
  }

  return normalizeConfidenceScore(params.pageConfidence);
}

export function normalizeVisionDetections(result: WebDetectionResult): DetectionCandidate[] {
  const pages = result.pagesWithMatchingImages;
  const candidates = new Map<string, DetectionCandidate>();
  const defaultConfidence = normalizeConfidenceScore(result.webEntities[0]?.score ?? null);

  for (const page of pages) {
    const matches = [...(page.fullMatchingImages ?? []), ...(page.partialMatchingImages ?? [])];

    if (matches.length === 0) {
      const candidate = buildCandidate(
        page,
        null,
        "page",
        resolveCandidateConfidenceScore({
          matchType: "page",
          pageConfidence: defaultConfidence,
        }),
      );

      if (candidate && (candidate.confidenceScore ?? 0) >= MIN_CONFIDENCE_SCORE) {
        candidates.set(
          `${candidate.canonicalSourceUrl}|${candidate.canonicalMatchedImageUrl}`,
          candidate,
        );
      }

      continue;
    }

    for (const match of matches) {
      const matchType = (page.fullMatchingImages ?? []).some((item) => item.url === match.url)
        ? "full"
        : "partial";
      const candidate = buildCandidate(
        page,
        match.url ?? null,
        matchType,
        resolveCandidateConfidenceScore({
          matchType,
          pageConfidence: defaultConfidence,
        }),
      );

      if (candidate && (candidate.confidenceScore ?? 0) >= MIN_CONFIDENCE_SCORE) {
        candidates.set(
          `${candidate.canonicalSourceUrl}|${candidate.canonicalMatchedImageUrl}`,
          candidate,
        );
      }
    }
  }

  return [...candidates.values()];
}

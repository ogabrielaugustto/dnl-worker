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
  visionPayload: Record<string, unknown>;
};

type RawPage = {
  url?: string | null;
  pageTitle?: string | null;
  fullMatchingImages?: Array<{ url?: string | null }>;
  partialMatchingImages?: Array<{ url?: string | null }>;
};

type RawDetection = {
  pagesWithMatchingImages?: RawPage[];
};

function buildCandidate(
  page: RawPage,
  matchedImageUrl: string | null,
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
    visionPayload: {
      page,
      matchedImageUrl,
    },
  };
}

export function normalizeVisionDetections(result: WebDetectionResult): DetectionCandidate[] {
  const raw = result.raw as RawDetection | undefined;
  const pages = raw?.pagesWithMatchingImages ?? [];
  const candidates = new Map<string, DetectionCandidate>();
  const defaultConfidence = result.webEntities[0]?.score ?? null;

  for (const page of pages) {
    const matches = [...(page.fullMatchingImages ?? []), ...(page.partialMatchingImages ?? [])];

    if (matches.length === 0) {
      const candidate = buildCandidate(page, null, defaultConfidence);

      if (candidate) {
        candidates.set(
          `${candidate.canonicalSourceUrl}|${candidate.canonicalMatchedImageUrl}`,
          candidate,
        );
      }

      continue;
    }

    for (const match of matches) {
      const candidate = buildCandidate(page, match.url ?? null, defaultConfidence);

      if (candidate) {
        candidates.set(
          `${candidate.canonicalSourceUrl}|${candidate.canonicalMatchedImageUrl}`,
          candidate,
        );
      }
    }
  }

  return [...candidates.values()];
}

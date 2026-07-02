import type { WebDetectionResult } from "./vision.service.js";
import { env } from "../../config/env.js";
import { canonicalizeUrl, extractDomain } from "../shared/url.js";

export type DetectionCandidate = {
  sourceUrl: string;
  canonicalSourceUrl: string;
  matchedImageUrl: string | null;
  canonicalMatchedImageUrl: string;
  pageTitle: string | null;
  domain: string | null;
  confidenceScore: number | null;
  matchType: "full" | "partial" | "page";
  sourceScope: "national" | "international";
  sourceScopeConfidence: number;
  visionPayload: Record<string, unknown>;
};

type VisionPage = {
  url?: string | null;
  pageTitle?: string | null;
  fullMatchingImages?: Array<{ url?: string | null }>;
  partialMatchingImages?: Array<{ url?: string | null }>;
};

type SourceScopeClassification = {
  sourceScope: DetectionCandidate["sourceScope"];
  sourceScopeConfidence: number;
  sourceScopeSignals: string[];
};

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

  const sourceScope = classifySourceScope({
    pageUrl: page.url,
    pageTitle: page.pageTitle ?? null,
    matchedImageUrl,
  });

  return {
    sourceUrl: page.url,
    canonicalSourceUrl,
    matchedImageUrl,
    canonicalMatchedImageUrl,
    pageTitle: page.pageTitle ?? null,
    domain: extractDomain(page.url),
    confidenceScore,
    matchType,
    sourceScope: sourceScope.sourceScope,
    sourceScopeConfidence: sourceScope.sourceScopeConfidence,
    visionPayload: {
      page,
      matchedImageUrl,
      matchType,
      minimumConfidenceScore: env.VISION_MIN_CONFIDENCE_SCORE,
      minimumPartialMatchConfidenceScore: env.VISION_PARTIAL_MATCH_MIN_CONFIDENCE_SCORE,
      minimumPageMatchConfidenceScore: env.VISION_PAGE_MATCH_MIN_CONFIDENCE_SCORE,
      webDetectionMaxResults: env.VISION_WEB_DETECTION_MAX_RESULTS,
      sourceScope: sourceScope.sourceScope,
      sourceScopeConfidence: sourceScope.sourceScopeConfidence,
      sourceScopeSignals: sourceScope.sourceScopeSignals,
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

function classifySourceScope(params: {
  pageUrl: string;
  pageTitle: string | null;
  matchedImageUrl: string | null;
}): SourceScopeClassification {
  const signals = new Set<string>();
  const pageUrlLower = params.pageUrl.toLowerCase();
  const pageTitleLower = params.pageTitle?.toLowerCase() ?? "";
  const matchedImageUrlLower = params.matchedImageUrl?.toLowerCase() ?? "";
  const domain = extractDomain(params.pageUrl) ?? "";

  if (
    domain.endsWith(".br") ||
    domain.endsWith(".com.br") ||
    domain.endsWith(".gov.br") ||
    domain.endsWith(".jus.br")
  ) {
    signals.add(`tld:${domain.split(".").slice(-2).join(".")}`);
  }

  const brazilianHints = ["pt-br", "pt_br", "ptbr", "pt-brasil", "lang=pt", "lang=pt-br", "locale=pt"];
  const combinedText = `${pageUrlLower} ${pageTitleLower} ${matchedImageUrlLower}`;

  for (const hint of brazilianHints) {
    if (combinedText.includes(hint)) {
      signals.add(`hint:${hint}`);
    }
  }

  const sourceScope = signals.size > 0 ? "national" : "international";
  const sourceScopeConfidence = signals.size === 0 ? 0.8 : 1;

  return {
    sourceScope,
    sourceScopeConfidence,
    sourceScopeSignals: [...signals],
  };
}

function meetsConfidenceThreshold(candidate: DetectionCandidate): boolean {
  const candidateScore = candidate.confidenceScore ?? 0;

  if (candidate.matchType === "partial") {
    return candidateScore >= env.VISION_PARTIAL_MATCH_MIN_CONFIDENCE_SCORE;
  }

  if (candidate.matchType === "page") {
    return candidateScore >= env.VISION_PAGE_MATCH_MIN_CONFIDENCE_SCORE;
  }

  return candidateScore >= env.VISION_MIN_CONFIDENCE_SCORE;
}

function compareCandidates(left: DetectionCandidate, right: DetectionCandidate): number {
  if (left.sourceScope !== right.sourceScope) {
    return left.sourceScope === "national" ? -1 : 1;
  }

  const confidenceDelta = (right.confidenceScore ?? 0) - (left.confidenceScore ?? 0);

  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }

  return left.canonicalSourceUrl.localeCompare(right.canonicalSourceUrl);
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

      if (candidate && meetsConfidenceThreshold(candidate)) {
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

      if (candidate && meetsConfidenceThreshold(candidate)) {
        candidates.set(
          `${candidate.canonicalSourceUrl}|${candidate.canonicalMatchedImageUrl}`,
          candidate,
        );
      }
    }
  }

  return [...candidates.values()].sort(compareCandidates);
}

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type pino from "pino";

import { upsertDetection } from "../detections/detections.repository.js";
import { upsertPendingDetectionEvidence } from "../evidence/evidence.repository.js";
import type { QueueManager } from "../jobs/queues.js";
import { getErrorMessage } from "../shared/errors.js";
import { canonicalizeUrl, extractDomain } from "../shared/url.js";
import type { DetectionCandidate } from "../vision/detection-normalizer.js";
import {
  downloadAndFingerprintImage,
  hammingDistance,
} from "./image-fingerprint.service.js";
import {
  completeSourceCrawlRun,
  createSourceCrawlRun,
  failSourceCrawlRun,
  getMonitoredSourceById,
  listActiveSourceSeedUrls,
  listActiveAssetFingerprints,
  markSourceSeedUrlCrawled,
  updateAssetFilePHash,
  upsertCrawledPage,
  upsertDiscoveredImage,
  type MonitoredAssetFingerprint,
} from "./sources.repository.js";

type DiscoveredPage = {
  url: string;
  lastModifiedAt: string | null;
};

type ImageCandidate = {
  url: string;
  altText: string | null;
  source: string;
};

const MAX_PAGES_PER_SOURCE = 50;
const MAX_IMAGES_PER_PAGE = 24;
const HIGH_CONFIDENCE_DISTANCE = 5;
const PROBABLE_DISTANCE = 10;
const USER_AGENT = "DNL-Worker/1.0 (+https://direitonalente.com)";

function uniqueByCanonicalUrl(pages: DiscoveredPage[]) {
  const seen = new Set<string>();
  const uniquePages: DiscoveredPage[] = [];

  for (const page of pages) {
    const canonical = canonicalizeUrl(page.url);

    if (!canonical || seen.has(canonical)) {
      continue;
    }

    seen.add(canonical);
    uniquePages.push(page);
  }

  return uniquePages;
}

function decodeHtmlEntity(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function resolveUrl(url: string, baseUrl: string) {
  try {
    return new URL(decodeHtmlEntity(url), baseUrl).toString();
  } catch {
    return null;
  }
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() ?? null;
}

function isRecent(lastModifiedAt: string | null, crawlWindowDays: number) {
  if (!lastModifiedAt) {
    return true;
  }

  const timestamp = new Date(lastModifiedAt).getTime();

  return Number.isNaN(timestamp) || Date.now() - timestamp <= crawlWindowDays * 24 * 60 * 60 * 1000;
}

async function fetchText(url: string, accept = "text/html,application/xhtml+xml") {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        accept,
      },
    });

    if (!response.ok) {
      return null;
    }

    return {
      body: await response.text(),
      finalUrl: response.url || url,
      statusCode: response.status,
    };
  } catch {
    return null;
  }
}

function parseSitemapUrls(xml: string, baseUrl: string): {
  pages: DiscoveredPage[];
  nestedSitemaps: string[];
} {
  const pages: DiscoveredPage[] = [];
  const nestedSitemaps: string[] = [];
  const sitemapBlocks = xml.match(/<sitemap[\s\S]*?<\/sitemap>/gi) ?? [];
  const urlBlocks = xml.match(/<url[\s\S]*?<\/url>/gi) ?? [];

  for (const block of sitemapBlocks) {
    const loc = block.match(/<loc[^>]*>([\s\S]*?)<\/loc>/i)?.[1]?.trim();
    const resolved = loc ? resolveUrl(loc, baseUrl) : null;

    if (resolved) {
      nestedSitemaps.push(resolved);
    }
  }

  for (const block of urlBlocks) {
    const loc = block.match(/<loc[^>]*>([\s\S]*?)<\/loc>/i)?.[1]?.trim();
    const lastmod = block.match(/<lastmod[^>]*>([\s\S]*?)<\/lastmod>/i)?.[1]?.trim() ?? null;
    const resolved = loc ? resolveUrl(loc, baseUrl) : null;

    if (resolved) {
      pages.push({
        url: resolved,
        lastModifiedAt: lastmod,
      });
    }
  }

  return {
    pages,
    nestedSitemaps,
  };
}

function parseRobotsSitemapUrls(robotsText: string, baseUrl: string) {
  return robotsText
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*sitemap:\s*(\S+)/i)?.[1])
    .filter((item): item is string => Boolean(item))
    .map((url) => resolveUrl(url, baseUrl))
    .filter((url): url is string => Boolean(url));
}

function pickSitemapUrls(urls: string[], limit: number) {
  if (urls.length <= limit) {
    return urls;
  }

  const selected = new Set<string>();
  const recentCount = Math.min(20, limit);

  for (const url of urls.slice(0, recentCount)) {
    selected.add(url);
  }

  const remainingSlots = limit - selected.size;

  for (let index = 0; index < remainingSlots; index += 1) {
    const sampledIndex = Math.floor((index / Math.max(1, remainingSlots - 1)) * (urls.length - 1));
    selected.add(urls[sampledIndex]);
  }

  return [...selected].slice(0, limit);
}

async function discoverRobotsSitemaps(baseUrl: string) {
  const robotsUrl = new URL("/robots.txt", baseUrl).toString();
  const response = await fetchText(robotsUrl, "text/plain,*/*");

  return response ? parseRobotsSitemapUrls(response.body, response.finalUrl) : [];
}

async function discoverSitemapPages(params: {
  baseUrl: string;
  configuredSitemapUrls: string[];
  crawlWindowDays: number;
  maxPages: number;
}) {
  const sitemapUrls = [
    ...params.configuredSitemapUrls,
    ...(await discoverRobotsSitemaps(params.baseUrl)),
    "/sitemap.xml",
    "/sitemap_index.xml",
    "/sitemap-news.xml",
  ].map((path) => new URL(path, params.baseUrl).toString());
  const pending = [...sitemapUrls];
  const visited = new Set<string>();
  const pages: DiscoveredPage[] = [];

  while (pending.length > 0 && pages.length < params.maxPages) {
    const sitemapUrl = pending.shift();

    if (!sitemapUrl || visited.has(sitemapUrl)) {
      continue;
    }

    visited.add(sitemapUrl);
    const response = await fetchText(sitemapUrl, "application/xml,text/xml,*/*");

    if (!response) {
      continue;
    }

    const parsed = parseSitemapUrls(response.body, response.finalUrl);

    pending.push(...pickSitemapUrls(parsed.nestedSitemaps, 80));
    pages.push(...parsed.pages.filter((page) => isRecent(page.lastModifiedAt, params.crawlWindowDays)));
  }

  return uniqueByCanonicalUrl(pages).slice(0, params.maxPages);
}

function extractLinksFromHtml(html: string, baseUrl: string) {
  const pages: DiscoveredPage[] = [];
  const anchorRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html))) {
    const resolved = resolveUrl(match[1] ?? "", baseUrl);

    if (resolved) {
      pages.push({
        url: resolved,
        lastModifiedAt: null,
      });
    }
  }

  return pages;
}

async function discoverRssPages(baseUrl: string, crawlWindowDays: number, maxPages: number) {
  const feedUrls = ["/feed", "/rss", "/rss.xml"].map((path) => new URL(path, baseUrl).toString());
  const pages: DiscoveredPage[] = [];

  for (const feedUrl of feedUrls) {
    const response = await fetchText(feedUrl, "application/rss+xml,application/xml,text/xml,*/*");

    if (!response) {
      continue;
    }

    const itemBlocks = response.body.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) ?? [];

    for (const block of itemBlocks) {
      const loc =
        block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]?.trim() ??
        block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)?.[1]?.trim();
      const publishedAt =
        block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() ??
        block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1]?.trim() ??
        null;
      const resolved = loc ? resolveUrl(loc, response.finalUrl) : null;

      if (resolved && isRecent(publishedAt, crawlWindowDays)) {
        pages.push({
          url: resolved,
          lastModifiedAt: publishedAt,
        });
      }
    }
  }

  return uniqueByCanonicalUrl(pages).slice(0, maxPages);
}

async function discoverHomePages(baseUrl: string, maxPages: number) {
  const response = await fetchText(baseUrl);

  if (!response) {
    return [];
  }

  const baseDomain = extractDomain(baseUrl);

  return uniqueByCanonicalUrl(
    extractLinksFromHtml(response.body, response.finalUrl).filter(
      (page) => extractDomain(page.url) === baseDomain,
    ),
  ).slice(0, maxPages);
}

async function discoverPages(params: {
  baseUrl: string;
  modes: string[];
  configuredSitemapUrls: string[];
  crawlWindowDays: number;
  maxPages: number;
  seedUrls: DiscoveredPage[];
}) {
  const selectedModes = params.modes.length > 0 ? params.modes : ["sitemap"];
  const discovered: DiscoveredPage[] = [...params.seedUrls];

  if (selectedModes.includes("sitemap")) {
    discovered.push(
      ...(await discoverSitemapPages({
        baseUrl: params.baseUrl,
        configuredSitemapUrls: params.configuredSitemapUrls,
        crawlWindowDays: params.crawlWindowDays,
        maxPages: params.maxPages,
      })),
    );
  }

  if (selectedModes.includes("rss")) {
    discovered.push(...(await discoverRssPages(params.baseUrl, params.crawlWindowDays, params.maxPages)));
  }

  if (selectedModes.includes("home")) {
    discovered.push(...(await discoverHomePages(params.baseUrl, params.maxPages)));
  }

  return uniqueByCanonicalUrl(discovered).slice(0, params.maxPages);
}

function readAttribute(tag: string, attribute: string) {
  const match = tag.match(new RegExp(`${attribute}=["']([^"']+)["']`, "i"));
  return match?.[1] ?? null;
}

function parseSrcset(srcset: string) {
  return srcset
    .split(",")
    .map((item) => item.trim().split(/\s+/)[0])
    .filter((item): item is string => Boolean(item));
}

function extractImagesFromHtml(html: string, pageUrl: string) {
  const candidates: ImageCandidate[] = [];
  const pushImage = (url: string | null | undefined, altText: string | null, source: string) => {
    if (!url) {
      return;
    }

    const resolved = resolveUrl(url, pageUrl);

    if (resolved) {
      candidates.push({
        url: resolved,
        altText,
        source,
      });
    }
  };

  for (const match of html.matchAll(/<meta[^>]+property=["']og:image(?::url)?["'][^>]*>/gi)) {
    pushImage(readAttribute(match[0], "content"), null, "og:image");
  }

  for (const match of html.matchAll(/<img[^>]*>/gi)) {
    const tag = match[0];
    const altText = readAttribute(tag, "alt");

    pushImage(readAttribute(tag, "src"), altText, "img");

    const srcset = readAttribute(tag, "srcset");

    if (srcset) {
      for (const src of parseSrcset(srcset)) {
        pushImage(src, altText, "img:srcset");
      }
    }
  }

  for (const match of html.matchAll(/<source[^>]+srcset=["']([^"']+)["'][^>]*>/gi)) {
    for (const src of parseSrcset(match[1] ?? "")) {
      pushImage(src, null, "source:srcset");
    }
  }

  for (const match of html.matchAll(/background-image\s*:\s*url\(["']?([^"')]+)["']?\)/gi)) {
    pushImage(match[1], null, "css:background");
  }

  for (const match of html.matchAll(/"image"\s*:\s*("[^"]+"|\[[^\]]+\])/gi)) {
    const raw = match[1] ?? "";

    for (const imageMatch of raw.matchAll(/"([^"]+)"/g)) {
      pushImage(imageMatch[1], null, "jsonld:image");
    }
  }

  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const canonical = canonicalizeUrl(candidate.url);

    if (!canonical || seen.has(canonical)) {
      return false;
    }

    seen.add(canonical);
    return true;
  });
}

async function ensureAssetFingerprint(
  supabase: SupabaseClient,
  asset: MonitoredAssetFingerprint,
) {
  if (asset.phash) {
    return asset.phash;
  }

  const fingerprint = await downloadAndFingerprintImage(asset.publicUrl).catch(() => null);

  if (!fingerprint) {
    return null;
  }

  await updateAssetFilePHash(supabase, asset.assetFileId, fingerprint.phash);
  asset.phash = fingerprint.phash;

  return fingerprint.phash;
}

function confidenceFromDistance(distance: number) {
  if (distance <= HIGH_CONFIDENCE_DISTANCE) {
    return 0.98;
  }

  return 0.9;
}

export async function processSourceCrawl(
  supabase: SupabaseClient,
  queueManager: QueueManager,
  logger: pino.Logger,
  sourceId: string,
): Promise<void> {
  const source = await getMonitoredSourceById(supabase, sourceId);
  const run = await createSourceCrawlRun(supabase, source.id);

  try {
    const seedUrls = await listActiveSourceSeedUrls(supabase, source.id);
    const pages = await discoverPages({
      baseUrl: source.base_url,
      modes: source.discovery_modes,
      configuredSitemapUrls: source.sitemap_urls,
      crawlWindowDays: source.crawl_window_days,
      maxPages: source.max_pages_per_run,
      seedUrls: seedUrls.map((seedUrl) => ({
        url: seedUrl.url,
        lastModifiedAt: null,
      })),
    });
    const assets = await listActiveAssetFingerprints(supabase);
    let pagesCrawled = 0;
    let imagesDiscovered = 0;
    let matchesCreated = 0;
    let imageDownloadSkipped = 0;
    let assetFingerprintSkipped = 0;

    for (const page of pages) {
      const response = await fetchText(page.url);

      if (!response) {
        continue;
      }

      const crawledPage = await upsertCrawledPage(supabase, {
        sourceId: source.id,
        crawlRunId: run.id,
        url: response.finalUrl,
        canonicalUrl: canonicalizeUrl(response.finalUrl),
        domain: extractDomain(response.finalUrl),
        title: extractTitle(response.body),
        statusCode: response.statusCode,
        contentHash: hashText(response.body),
      });
      pagesCrawled += 1;

      await markSourceSeedUrlCrawled(supabase, source.id, canonicalizeUrl(response.finalUrl)).catch(
        () => undefined,
      );

      const imageCandidates = extractImagesFromHtml(response.body, response.finalUrl).slice(
        0,
        MAX_IMAGES_PER_PAGE,
      );

      for (const imageCandidate of imageCandidates) {
        const image = await downloadAndFingerprintImage(
          imageCandidate.url,
          response.finalUrl,
        ).catch((error) => {
          imageDownloadSkipped += 1;
          logger.warn(
            {
              event: "source_image_download_skipped",
              sourceId: source.id,
              sourceDomain: source.domain,
              pageUrl: response.finalUrl,
              imageUrl: imageCandidate.url,
              error: getErrorMessage(error),
            },
            "Source image download skipped",
          );

          return null;
        });

        if (!image) {
          continue;
        }

        imagesDiscovered += 1;
        await upsertDiscoveredImage(supabase, {
          sourceId: source.id,
          crawledPageId: crawledPage.id,
          crawlRunId: run.id,
          pageUrl: response.finalUrl,
          imageUrl: imageCandidate.url,
          normalizedUrl: canonicalizeUrl(imageCandidate.url),
          domain: extractDomain(imageCandidate.url),
          width: image.width,
          height: image.height,
          contentType: image.contentType,
          sizeBytes: image.sizeBytes,
          phash: image.phash,
          altText: imageCandidate.altText,
          metadata: {
            extractionSource: imageCandidate.source,
          },
        });

        for (const asset of assets) {
          const assetPHash = await ensureAssetFingerprint(supabase, asset).catch((error) => {
            assetFingerprintSkipped += 1;
            logger.warn(
              {
                event: "asset_fingerprint_skipped",
                sourceId: source.id,
                sourceDomain: source.domain,
                assetId: asset.assetId,
                assetFileId: asset.assetFileId,
                error: getErrorMessage(error),
              },
              "Asset fingerprint skipped",
            );

            return null;
          });

          if (!assetPHash) {
            continue;
          }

          const distance = hammingDistance(image.phash, assetPHash);

          if (distance > PROBABLE_DISTANCE) {
            continue;
          }

          const candidate: DetectionCandidate = {
            sourceUrl: response.finalUrl,
            canonicalSourceUrl: canonicalizeUrl(response.finalUrl),
            matchedImageUrl: imageCandidate.url,
            canonicalMatchedImageUrl: canonicalizeUrl(imageCandidate.url),
            pageTitle: crawledPage.title,
            domain: crawledPage.domain,
            confidenceScore: confidenceFromDistance(distance),
            matchType: "perceptual_hash",
            visionPayload: {
              source: "directed_crawl",
              sourceId: source.id,
              crawlRunId: run.id,
              matchedImageUrl: imageCandidate.url,
              matchType: "perceptual_hash",
              phashDistance: distance,
              phashThreshold: PROBABLE_DISTANCE,
            },
          };

          const upserted = await upsertDetection(supabase, {
            organizationId: asset.organizationId,
            assetId: asset.assetId,
            scanJobId: null,
            candidate,
          });

          if (upserted.isNew) {
            matchesCreated += 1;
          }

          await upsertPendingDetectionEvidence(supabase, {
            organizationId: asset.organizationId,
            detectionId: upserted.detection.id,
            scanRunId: null,
            sourceUrl: upserted.detection.source_url,
            matchedImageUrl: upserted.detection.matched_image_url,
          });

          await queueManager.enqueueEvidenceJob({
            organizationId: asset.organizationId,
            detectionId: upserted.detection.id,
            scanRunId: null,
            evidenceRunId: run.id,
            sourceUrl: upserted.detection.source_url,
            matchedImageUrl: upserted.detection.matched_image_url,
          });
        }
      }
    }

    await completeSourceCrawlRun(supabase, {
      sourceId: source.id,
      runId: run.id,
      startedAt: run.started_at,
      pagesDiscovered: pages.length,
      pagesCrawled,
      imagesDiscovered,
      matchesCreated,
      metadata: {
        discoveryModes: source.discovery_modes,
        imageDownloadSkipped,
        assetFingerprintSkipped,
      },
    });

    logger.info(
      {
        event: "source_crawl_completed",
        sourceId: source.id,
        sourceDomain: source.domain,
        crawlRunId: run.id,
        pagesDiscovered: pages.length,
        pagesCrawled,
        imagesDiscovered,
        matchesCreated,
        imageDownloadSkipped,
        assetFingerprintSkipped,
      },
      "Source crawl completed",
    );
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    await failSourceCrawlRun(supabase, {
      sourceId: source.id,
      runId: run.id,
      startedAt: run.started_at,
      errorCode: "source_crawl_failed",
      errorMessage,
    });

    logger.error(
      {
        event: "source_crawl_failed",
        sourceId: source.id,
        sourceDomain: source.domain,
        crawlRunId: run.id,
        error: errorMessage,
      },
      "Source crawl failed",
    );

    throw error;
  }
}

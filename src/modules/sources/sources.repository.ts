import type { SupabaseClient } from "@supabase/supabase-js";

import { AppError } from "../shared/errors.js";
import type { CrawledPageRecord, MonitoredSourceRecord, SourceCrawlRunRecord } from "../shared/types.js";

export type MonitoredAssetFingerprint = {
  organizationId: string;
  assetId: string;
  assetFileId: string;
  publicUrl: string;
  phash: string | null;
};

export async function listDueMonitoredSources(
  supabase: SupabaseClient,
  limit = 25,
): Promise<MonitoredSourceRecord[]> {
  const { data, error } = await supabase
    .from("monitored_sources")
    .select(
      "id, name, domain, base_url, source_type, priority, crawl_frequency_hours, discovery_modes, sitemap_urls, crawl_window_days, max_pages_per_run, is_active, last_crawled_at, created_at, updated_at",
    )
    .eq("is_active", true)
    .order("last_crawled_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    throw new AppError(error.message, {
      code: "list_due_monitored_sources_failed",
      retryable: true,
    });
  }

  const now = Date.now();

  return ((data ?? []) as MonitoredSourceRecord[]).filter((source) => {
    if (!source.last_crawled_at) {
      return true;
    }

    const nextRunAt =
      new Date(source.last_crawled_at).getTime() + source.crawl_frequency_hours * 60 * 60 * 1000;

    return nextRunAt <= now;
  });
}

export async function getMonitoredSourceById(
  supabase: SupabaseClient,
  sourceId: string,
): Promise<MonitoredSourceRecord> {
  const { data, error } = await supabase
    .from("monitored_sources")
    .select(
      "id, name, domain, base_url, source_type, priority, crawl_frequency_hours, discovery_modes, sitemap_urls, crawl_window_days, max_pages_per_run, is_active, last_crawled_at, created_at, updated_at",
    )
    .eq("id", sourceId)
    .maybeSingle();

  if (error || !data) {
    throw new AppError(error?.message ?? "Monitored source not found", {
      code: "monitored_source_not_found",
      retryable: false,
    });
  }

  return data as MonitoredSourceRecord;
}

export async function getMonitoredSourceByDomain(
  supabase: SupabaseClient,
  domain: string,
): Promise<MonitoredSourceRecord> {
  const { data, error } = await supabase
    .from("monitored_sources")
    .select(
      "id, name, domain, base_url, source_type, priority, crawl_frequency_hours, discovery_modes, sitemap_urls, crawl_window_days, max_pages_per_run, is_active, last_crawled_at, created_at, updated_at",
    )
    .eq("domain", domain.toLowerCase())
    .maybeSingle();

  if (error || !data) {
    throw new AppError(error?.message ?? "Monitored source not found", {
      code: "monitored_source_not_found",
      retryable: false,
    });
  }

  return data as MonitoredSourceRecord;
}

export async function listActiveSourceSeedUrls(
  supabase: SupabaseClient,
  sourceId: string,
): Promise<Array<{ url: string; canonicalUrl: string; label: string | null }>> {
  const { data, error } = await supabase
    .from("source_seed_urls")
    .select("url, canonical_url, label")
    .eq("source_id", sourceId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    throw new AppError(error.message, {
      code: "list_source_seed_urls_failed",
      retryable: true,
    });
  }

  return ((data ?? []) as Array<{ url: string; canonical_url: string; label: string | null }>).map(
    (item) => ({
      url: item.url,
      canonicalUrl: item.canonical_url,
      label: item.label,
    }),
  );
}

export async function markSourceSeedUrlCrawled(
  supabase: SupabaseClient,
  sourceId: string,
  canonicalUrl: string,
): Promise<void> {
  const { error } = await supabase
    .from("source_seed_urls")
    .update({
      last_crawled_at: new Date().toISOString(),
    })
    .eq("source_id", sourceId)
    .eq("canonical_url", canonicalUrl);

  if (error) {
    throw new AppError(error.message, {
      code: "mark_source_seed_url_crawled_failed",
      retryable: true,
    });
  }
}

export async function createSourceCrawlRun(
  supabase: SupabaseClient,
  sourceId: string,
): Promise<SourceCrawlRunRecord> {
  const { data, error } = await supabase
    .from("source_crawl_runs")
    .insert({
      source_id: sourceId,
      status: "processing",
    })
    .select(
      "id, source_id, status, started_at, finished_at, duration_ms, pages_discovered, pages_crawled, images_discovered, matches_created, error_code, error_message, metadata",
    )
    .single();

  if (error || !data) {
    throw new AppError(error?.message ?? "Failed to create source crawl run", {
      code: "create_source_crawl_run_failed",
      retryable: true,
    });
  }

  return data as SourceCrawlRunRecord;
}

export async function completeSourceCrawlRun(
  supabase: SupabaseClient,
  params: {
    sourceId: string;
    runId: string;
    startedAt: string;
    pagesDiscovered: number;
    pagesCrawled: number;
    imagesDiscovered: number;
    matchesCreated: number;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  const finishedAt = new Date().toISOString();
  const durationMs = Math.max(0, Date.now() - new Date(params.startedAt).getTime());

  const [{ error: runError }, { error: sourceError }] = await Promise.all([
    supabase
      .from("source_crawl_runs")
      .update({
        status: "completed",
        finished_at: finishedAt,
        duration_ms: durationMs,
        pages_discovered: params.pagesDiscovered,
        pages_crawled: params.pagesCrawled,
        images_discovered: params.imagesDiscovered,
        matches_created: params.matchesCreated,
        metadata: params.metadata,
      })
      .eq("id", params.runId),
    supabase
      .from("monitored_sources")
      .update({
        last_crawled_at: finishedAt,
      })
      .eq("id", params.sourceId),
  ]);

  if (runError || sourceError) {
    throw new AppError(runError?.message ?? sourceError?.message ?? "Failed to complete crawl run", {
      code: "complete_source_crawl_run_failed",
      retryable: true,
    });
  }
}

export async function failSourceCrawlRun(
  supabase: SupabaseClient,
  params: {
    sourceId: string;
    runId: string;
    startedAt: string;
    errorCode: string;
    errorMessage: string;
  },
): Promise<void> {
  const finishedAt = new Date().toISOString();
  const durationMs = Math.max(0, Date.now() - new Date(params.startedAt).getTime());

  const [{ error: runError }, { error: sourceError }] = await Promise.all([
    supabase
      .from("source_crawl_runs")
      .update({
        status: "failed",
        finished_at: finishedAt,
        duration_ms: durationMs,
        error_code: params.errorCode,
        error_message: params.errorMessage,
      })
      .eq("id", params.runId),
    supabase
      .from("monitored_sources")
      .update({
        last_crawled_at: finishedAt,
      })
      .eq("id", params.sourceId),
  ]);

  if (runError || sourceError) {
    throw new AppError(runError?.message ?? sourceError?.message ?? "Failed to fail crawl run", {
      code: "fail_source_crawl_run_failed",
      retryable: true,
    });
  }
}

export async function upsertCrawledPage(
  supabase: SupabaseClient,
  params: {
    sourceId: string;
    crawlRunId: string;
    url: string;
    canonicalUrl: string;
    domain: string | null;
    title: string | null;
    statusCode: number | null;
    contentHash: string | null;
  },
): Promise<CrawledPageRecord> {
  const { data, error } = await supabase
    .from("crawled_pages")
    .upsert(
      {
        source_id: params.sourceId,
        crawl_run_id: params.crawlRunId,
        url: params.url,
        canonical_url: params.canonicalUrl,
        domain: params.domain,
        title: params.title,
        status_code: params.statusCode,
        content_hash: params.contentHash,
        crawled_at: new Date().toISOString(),
      },
      {
        onConflict: "source_id,canonical_url",
      },
    )
    .select("id, source_id, crawl_run_id, url, canonical_url, domain, title, status_code, content_hash, crawled_at")
    .single();

  if (error || !data) {
    throw new AppError(error?.message ?? "Failed to upsert crawled page", {
      code: "upsert_crawled_page_failed",
      retryable: true,
    });
  }

  return data as CrawledPageRecord;
}

export async function upsertDiscoveredImage(
  supabase: SupabaseClient,
  params: {
    sourceId: string;
    crawledPageId: string;
    crawlRunId: string;
    pageUrl: string;
    imageUrl: string;
    normalizedUrl: string;
    domain: string | null;
    width: number | null;
    height: number | null;
    contentType: string | null;
    sizeBytes: number | null;
    phash: string | null;
    altText: string | null;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("discovered_images").upsert(
    {
      source_id: params.sourceId,
      crawled_page_id: params.crawledPageId,
      crawl_run_id: params.crawlRunId,
      page_url: params.pageUrl,
      image_url: params.imageUrl,
      normalized_url: params.normalizedUrl,
      domain: params.domain,
      width: params.width,
      height: params.height,
      content_type: params.contentType,
      size_bytes: params.sizeBytes,
      phash: params.phash,
      alt_text: params.altText,
      metadata: params.metadata,
      collected_at: new Date().toISOString(),
    },
    {
      onConflict: "crawled_page_id,normalized_url",
    },
  );

  if (error) {
    throw new AppError(error.message, {
      code: "upsert_discovered_image_failed",
      retryable: true,
    });
  }
}

export async function listActiveAssetFingerprints(
  supabase: SupabaseClient,
): Promise<MonitoredAssetFingerprint[]> {
  const { data, error } = await supabase
    .from("asset_files")
    .select("id, organization_id, asset_id, public_url, phash, assets!inner(status)")
    .eq("is_primary", true)
    .not("public_url", "is", null)
    .eq("assets.status", "active");

  if (error) {
    throw new AppError(error.message, {
      code: "list_active_asset_fingerprints_failed",
      retryable: true,
    });
  }

  return ((data ?? []) as Array<{
    id: string;
    organization_id: string;
    asset_id: string;
    public_url: string | null;
    phash: string | null;
  }>)
    .filter((item) => item.public_url)
    .map((item) => ({
      organizationId: item.organization_id,
      assetId: item.asset_id,
      assetFileId: item.id,
      publicUrl: item.public_url as string,
      phash: item.phash,
    }));
}

export async function updateAssetFilePHash(
  supabase: SupabaseClient,
  assetFileId: string,
  phash: string,
): Promise<void> {
  const { error } = await supabase
    .from("asset_files")
    .update({ phash })
    .eq("id", assetFileId);

  if (error) {
    throw new AppError(error.message, {
      code: "update_asset_file_phash_failed",
      retryable: true,
    });
  }
}

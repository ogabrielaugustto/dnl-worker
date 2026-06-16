import { env } from "../../config/env.js";
import { ExternalServiceError } from "../shared/errors.js";

const WAYBACK_SAVE_URL = "https://web.archive.org/save";
const WAYBACK_AVAILABILITY_URL = "https://archive.org/wayback/available";
const WAYBACK_CDX_URL = "https://web.archive.org/cdx/search/cdx";
const WAYBACK_USER_AGENT = "DNL-Worker/1.0 (+https://direitonalente.com)";

type WaybackSaveStatusResponse = {
  status?: string;
  job_id?: string;
  timestamp?: string;
  original_url?: string;
  status_ext?: string;
  exception?: string;
  first_archive?: boolean;
  resources?: unknown[];
  outlinks?: string[];
};

type WaybackAvailabilityResponse = {
  archived_snapshots?: {
    closest?: {
      available?: boolean;
      url?: string;
      timestamp?: string;
      status?: string;
    };
  };
};

export type WaybackTimelineEntry = {
  timestamp: string;
  archivedAt: string | null;
  originalUrl: string;
  playbackUrl: string;
  statusCode: string | null;
  digest: string | null;
};

export type WaybackCaptureResult = {
  requestUrl: string;
  saveHttpStatus: number;
  saveJobId: string | null;
  jobStatus: string | null;
  jobStatusDetail: string | null;
  latestSnapshotUrl: string | null;
  latestSnapshotTimestamp: string | null;
  latestSnapshotAt: string | null;
  latestSnapshotStatus: string | null;
  timeline: WaybackTimelineEntry[];
  rawAvailability: WaybackAvailabilityResponse;
  rawSaveStatus: WaybackSaveStatusResponse | null;
};

function buildPlaybackUrl(timestamp: string, originalUrl: string): string {
  return `https://web.archive.org/web/${timestamp}/${originalUrl}`;
}

function parseWaybackTimestamp(timestamp: string | null | undefined): string | null {
  if (!timestamp || !/^\d{14}$/.test(timestamp)) {
    return null;
  }

  const year = timestamp.slice(0, 4);
  const month = timestamp.slice(4, 6);
  const day = timestamp.slice(6, 8);
  const hour = timestamp.slice(8, 10);
  const minute = timestamp.slice(10, 12);
  const second = timestamp.slice(12, 14);

  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
}

function extractSaveJobId(html: string): string | null {
  const match = html.match(/spn\.watchJob\("([^"]+)"/);
  return match?.[1] ?? null;
}

function toExternalServiceError(message: string, code: string, retryable = true): ExternalServiceError {
  return new ExternalServiceError(message, code, retryable);
}

async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(env.WAYBACK_REQUEST_TIMEOUT_MS),
      headers: {
        "user-agent": WAYBACK_USER_AGENT,
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    throw toExternalServiceError(
      error instanceof Error ? error.message : "Wayback request failed",
      "wayback_request_failed",
      true,
    );
  }
}

async function submitSavePageNow(url: string): Promise<{
  saveHttpStatus: number;
  saveJobId: string | null;
}> {
  const body = new URLSearchParams({
    url,
    capture_all: "on",
  });

  const response = await fetchWithTimeout(WAYBACK_SAVE_URL, {
    method: "POST",
    redirect: "follow",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body,
  });

  if (!response.ok) {
    throw toExternalServiceError(
      `Wayback Save Page Now request failed (${response.status})`,
      "wayback_save_failed",
      response.status >= 500 || response.status === 429,
    );
  }

  const html = await response.text();

  return {
    saveHttpStatus: response.status,
    saveJobId: extractSaveJobId(html),
  };
}

async function fetchSaveStatus(jobId: string): Promise<WaybackSaveStatusResponse> {
  const response = await fetchWithTimeout(`${WAYBACK_SAVE_URL}/status/${jobId}`, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw toExternalServiceError(
      `Wayback status request failed (${response.status})`,
      "wayback_status_failed",
      response.status >= 500 || response.status === 429,
    );
  }

  return (await response.json()) as WaybackSaveStatusResponse;
}

async function pollSaveStatus(jobId: string): Promise<WaybackSaveStatusResponse | null> {
  let latestStatus: WaybackSaveStatusResponse | null = null;

  for (let attempt = 0; attempt < env.WAYBACK_STATUS_MAX_ATTEMPTS; attempt += 1) {
    latestStatus = await fetchSaveStatus(jobId);

    if (latestStatus.status && latestStatus.status !== "pending") {
      return latestStatus;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, env.WAYBACK_STATUS_POLL_INTERVAL_MS);
    });
  }

  return latestStatus;
}

async function fetchAvailability(url: string): Promise<WaybackAvailabilityResponse> {
  const availabilityUrl = `${WAYBACK_AVAILABILITY_URL}?url=${encodeURIComponent(url)}`;
  const response = await fetchWithTimeout(availabilityUrl, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw toExternalServiceError(
      `Wayback availability request failed (${response.status})`,
      "wayback_availability_failed",
      response.status >= 500 || response.status === 429,
    );
  }

  return (await response.json()) as WaybackAvailabilityResponse;
}

async function fetchTimeline(url: string): Promise<WaybackTimelineEntry[]> {
  const query = new URLSearchParams({
    url,
    output: "json",
    fl: "timestamp,original,statuscode,digest",
    filter: "statuscode:200",
    limit: String(env.WAYBACK_TIMELINE_LIMIT),
  });

  const response = await fetchWithTimeout(`${WAYBACK_CDX_URL}?${query.toString()}`, {
    headers: {
      accept: "application/json,text/plain",
    },
  });

  if (!response.ok) {
    throw toExternalServiceError(
      `Wayback timeline request failed (${response.status})`,
      "wayback_timeline_failed",
      response.status >= 500 || response.status === 429,
    );
  }

  const rows = (await response.json()) as string[][];

  if (!Array.isArray(rows) || rows.length <= 1) {
    return [];
  }

  return rows.slice(1).map((row) => {
    const timestamp = row[0] ?? "";
    const originalUrl = row[1] ?? url;
    const statusCode = row[2] ?? null;
    const digest = row[3] ?? null;

    return {
      timestamp,
      archivedAt: parseWaybackTimestamp(timestamp),
      originalUrl,
      playbackUrl: buildPlaybackUrl(timestamp, originalUrl),
      statusCode,
      digest,
    };
  });
}

export async function archiveUrlInWayback(url: string): Promise<WaybackCaptureResult> {
  const { saveHttpStatus, saveJobId } = await submitSavePageNow(url);
  const rawSaveStatus = saveJobId ? await pollSaveStatus(saveJobId) : null;
  const rawAvailability = await fetchAvailability(url);
  const timeline = await fetchTimeline(url);

  const closestSnapshot = rawAvailability.archived_snapshots?.closest;
  const latestSnapshotTimestamp =
    rawSaveStatus?.timestamp ?? closestSnapshot?.timestamp ?? timeline[0]?.timestamp ?? null;
  const latestSnapshotUrl =
    closestSnapshot?.url ??
    (latestSnapshotTimestamp
      ? buildPlaybackUrl(latestSnapshotTimestamp, rawSaveStatus?.original_url ?? url)
      : timeline[0]?.playbackUrl ?? null);
  const latestSnapshotStatus =
    rawSaveStatus?.status_ext ?? rawSaveStatus?.status ?? closestSnapshot?.status ?? timeline[0]?.statusCode ?? null;

  return {
    requestUrl: url,
    saveHttpStatus,
    saveJobId,
    jobStatus: rawSaveStatus?.status ?? null,
    jobStatusDetail: rawSaveStatus?.status_ext ?? rawSaveStatus?.exception ?? null,
    latestSnapshotUrl,
    latestSnapshotTimestamp,
    latestSnapshotAt: parseWaybackTimestamp(latestSnapshotTimestamp),
    latestSnapshotStatus,
    timeline,
    rawAvailability,
    rawSaveStatus,
  };
}

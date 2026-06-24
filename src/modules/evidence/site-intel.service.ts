import { ExternalServiceError } from "../shared/errors.js";

type RemoteImageResult = {
  body: Buffer;
  contentType: string;
};

export type SiteSnapshot = {
  domain: string | null;
  finalUrl: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
};

function readMetaContent(html: string, attribute: string, key: string) {
  const regex = new RegExp(
    `<meta[^>]+${attribute}=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+${attribute}=["']${key}["'][^>]*>`,
    "i",
  );
  const match = html.match(regex);

  return match?.[1] ?? match?.[2] ?? null;
}

function readTitle(html: string) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() ?? null;
}

function readDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "DNL-Worker/1.0 (+https://direitonalente.com)",
      accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new ExternalServiceError(
      `Failed to fetch site snapshot (${response.status})`,
      "site_snapshot_fetch_failed",
      true,
    );
  }

  return {
    html: await response.text(),
    finalUrl: response.url || url,
  };
}

export async function downloadMatchedImage(
  url: string,
  refererUrl?: string,
): Promise<RemoteImageResult> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "DNL-Worker/1.0 (+https://direitonalente.com)",
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      ...(refererUrl ? { referer: refererUrl } : {}),
    },
  });

  if (!response.ok) {
    throw new ExternalServiceError(
      `Failed to download matched image (${response.status})`,
      "matched_image_download_failed",
      true,
    );
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";

  if (contentType.toLowerCase().startsWith("text/html")) {
    throw new ExternalServiceError(
      "Matched image URL returned HTML instead of an image",
      "matched_image_download_failed",
      true,
    );
  }

  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType,
  };
}

export async function captureSiteSnapshot(url: string): Promise<SiteSnapshot> {
  const { html, finalUrl } = await fetchText(url);
  const domain = readDomain(finalUrl);

  return {
    domain,
    finalUrl,
    title: readTitle(html),
    description:
      readMetaContent(html, "name", "description") ??
      readMetaContent(html, "property", "og:description"),
    siteName: readMetaContent(html, "property", "og:site_name"),
  };
}

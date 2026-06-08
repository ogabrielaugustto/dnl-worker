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
  cnpjCandidates: string[];
  emails: string[];
  phones: string[];
  rdap: {
    registrar: string | null;
    status: string[];
    entities: Array<{
      handle: string | null;
      roles: string[];
      name: string | null;
      organization: string | null;
      email: string | null;
    }>;
  } | null;
};

const CNPJ_REGEX = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_REGEX = /(?:\+55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}\b/g;

function unique(values: Iterable<string>) {
  return [...new Set([...values].map((value) => value.trim()).filter(Boolean))];
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
}

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

async function fetchRdap(domain: string) {
  try {
    const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      redirect: "follow",
      headers: {
        accept: "application/rdap+json, application/json",
        "user-agent": "DNL-Worker/1.0 (+https://direitonalente.com)",
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const entities = Array.isArray(payload.entities) ? payload.entities : [];

    return {
      registrar:
        typeof payload.port43 === "string"
          ? payload.port43
          : typeof payload.ldhName === "string"
            ? payload.ldhName
            : null,
      status: Array.isArray(payload.status)
        ? payload.status.filter((item): item is string => typeof item === "string")
        : [],
      entities: entities.map((entity) => {
        const item = entity as Record<string, unknown>;
        const vcardArray = Array.isArray(item.vcardArray) ? item.vcardArray : [];
        const vcardEntries = Array.isArray(vcardArray[1]) ? vcardArray[1] : [];
        let name: string | null = null;
        let organization: string | null = null;
        let email: string | null = null;

        for (const entry of vcardEntries) {
          if (!Array.isArray(entry) || entry.length < 4) {
            continue;
          }

          const key = entry[0];
          const value = entry[3];

          if (key === "fn" && typeof value === "string") {
            name = value;
          }

          if (key === "org" && Array.isArray(value) && typeof value[0] === "string") {
            organization = value[0];
          }

          if (key === "email" && typeof value === "string") {
            email = value;
          }
        }

        return {
          handle: typeof item.handle === "string" ? item.handle : null,
          roles: Array.isArray(item.roles)
            ? item.roles.filter((role): role is string => typeof role === "string")
            : [],
          name,
          organization,
          email,
        };
      }),
    };
  } catch {
    return null;
  }
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
  const cleanedHtml = stripHtml(html);
  const domain = readDomain(finalUrl);

  return {
    domain,
    finalUrl,
    title: readTitle(html),
    description:
      readMetaContent(html, "name", "description") ??
      readMetaContent(html, "property", "og:description"),
    siteName: readMetaContent(html, "property", "og:site_name"),
    cnpjCandidates: unique(cleanedHtml.match(CNPJ_REGEX) ?? []).slice(0, 10),
    emails: unique(cleanedHtml.match(EMAIL_REGEX) ?? []).slice(0, 10),
    phones: unique(cleanedHtml.match(PHONE_REGEX) ?? []).slice(0, 10),
    rdap: domain ? await fetchRdap(domain) : null,
  };
}

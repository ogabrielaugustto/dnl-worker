import { env } from "../../config/env.js";

const CNPJ_REGEX = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_REGEX = /(?:\+55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}\b/g;
const MAILTO_REGEX = /mailto:([^"'?#\s>]+)/gi;
const HREF_REGEX = /<a[^>]+href=["']([^"'#]+)["'][^>]*>/gi;

const PRIORITY_HINTS = [
  "contato",
  "contact",
  "about",
  "sobre",
  "empresa",
  "institucional",
  "privacy",
  "privacidade",
  "terms",
  "termos",
];

const BINARY_EXTENSIONS = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".zip",
  ".rar",
  ".7z",
  ".mp4",
  ".mp3",
];

export type SiteIntelCandidateType = "email" | "phone" | "cnpj" | "rdap_email";
export type SiteIntelSourceType = "page_content" | "mailto" | "rdap";
export type SiteIntelPageCategory = "source" | "contact" | "about" | "policy" | "terms" | "other";

export type SiteIntelContactCandidate = {
  type: SiteIntelCandidateType;
  value: string;
  sourceUrl: string;
  sourceType: SiteIntelSourceType;
  pageCategory: SiteIntelPageCategory | null;
};

export type SiteIntelPageFinding = {
  url: string;
  finalUrl: string;
  title: string | null;
  contentType: string;
  pageCategory: SiteIntelPageCategory;
  emails: string[];
  phones: string[];
  cnpjCandidates: string[];
  mailtoLinks: string[];
};

export type SiteIntelRdapEntity = {
  handle: string | null;
  parentHandle: string | null;
  roles: string[];
  name: string | null;
  organization: string | null;
  email: string | null;
  publicIds: Array<{
    type: string | null;
    identifier: string | null;
  }>;
};

export type SiteIntelDomainOwnerContactStatus = "found" | "fallback" | "missing";
export type SiteIntelDomainOwnerSourceType = "rdap" | "public_site" | "none";

export type SiteIntelDomainOwnerContact = {
  registeredDomain: string | null;
  name: string | null;
  organization: string | null;
  document: string | null;
  email: string | null;
  sourceType: SiteIntelDomainOwnerSourceType;
  sourceUrl: string | null;
  contactStatus: SiteIntelDomainOwnerContactStatus;
  roles: string[];
};

export type SiteIntelDomainOwnerCandidate = SiteIntelDomainOwnerContact & {
  handle: string | null;
};

export type SiteIntelInvestigationResult = {
  domain: string | null;
  registeredDomain: string | null;
  sourceUrl: string;
  finalUrl: string;
  rdapPayload: Record<string, unknown> | null;
  rdapEntities: SiteIntelRdapEntity[];
  domainOwner: SiteIntelDomainOwnerContact;
  domainOwnerCandidates: SiteIntelDomainOwnerCandidate[];
  pageFindings: SiteIntelPageFinding[];
  contactCandidates: SiteIntelContactCandidate[];
  primaryEmail: string | null;
  primaryPhone: string | null;
  primaryCnpj: string | null;
  primaryContactPageUrl: string | null;
};

type HtmlPage = {
  url: string;
  finalUrl: string;
  html: string;
  contentType: string;
};

function unique(values: Iterable<string>): string[] {
  return [...new Set([...values].map((value) => value.trim()).filter(Boolean))];
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
}

function readDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function readTitle(html: string) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() ?? null;
}

function normalizeUrl(baseUrl: string, href: string): string | null {
  try {
    const value = new URL(href, baseUrl);
    return value.protocol === "http:" || value.protocol === "https:" ? value.toString() : null;
  } catch {
    return null;
  }
}

function isSameDomain(url: string, domain: string): boolean {
  return readDomain(url) === domain;
}

function isProbablyBinary(url: string): boolean {
  const pathname = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();

  return BINARY_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}

function classifyPage(url: string, isSourcePage: boolean): SiteIntelPageCategory {
  if (isSourcePage) {
    return "source";
  }

  const value = url.toLowerCase();

  if (value.includes("contato") || value.includes("contact")) {
    return "contact";
  }

  if (value.includes("sobre") || value.includes("about") || value.includes("empresa")) {
    return "about";
  }

  if (value.includes("privacy") || value.includes("privacidade")) {
    return "policy";
  }

  if (value.includes("terms") || value.includes("termos")) {
    return "terms";
  }

  return "other";
}

function pagePriority(url: string): number {
  const lowerUrl = url.toLowerCase();

  for (let index = 0; index < PRIORITY_HINTS.length; index += 1) {
    if (lowerUrl.includes(PRIORITY_HINTS[index])) {
      return index;
    }
  }

  return PRIORITY_HINTS.length + 1;
}

function extractLinks(html: string, baseUrl: string, domain: string): string[] {
  const links: string[] = [];

  for (const match of html.matchAll(HREF_REGEX)) {
    const href = match[1];
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) {
      continue;
    }

    const normalizedUrl = normalizeUrl(baseUrl, href);
    if (!normalizedUrl || !isSameDomain(normalizedUrl, domain) || isProbablyBinary(normalizedUrl)) {
      continue;
    }

    links.push(normalizedUrl);
  }

  return unique(links).sort((left, right) => pagePriority(left) - pagePriority(right));
}

async function fetchHtmlPage(url: string, requestTimeoutMs: number): Promise<HtmlPage | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "DNL-Worker/1.0 (+https://direitonalente.com)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      return null;
    }

    const contentType = (response.headers.get("content-type") ?? "text/html").split(";")[0].trim();
    if (contentType !== "text/html" && contentType !== "application/xhtml+xml") {
      return null;
    }

    return {
      url,
      finalUrl: response.url || url,
      html: await response.text(),
      contentType: "text/html",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRdapPayload(domain: string, requestTimeoutMs: number): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "application/rdap+json, application/json",
        "user-agent": "DNL-Worker/1.0 (+https://direitonalente.com)",
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function readVcardEntries(item: Record<string, unknown>): unknown[] {
  const vcardArray = Array.isArray(item.vcardArray) ? item.vcardArray : [];
  return Array.isArray(vcardArray[1]) ? vcardArray[1] : [];
}

function readVcardString(item: Record<string, unknown>, keyName: string): string | null {
  for (const entry of readVcardEntries(item)) {
    if (!Array.isArray(entry) || entry.length < 4) {
      continue;
    }

    const [key, , , value] = entry;
    if (key === keyName && typeof value === "string") {
      return value;
    }
  }

  return null;
}

function readVcardOrganization(item: Record<string, unknown>): string | null {
  for (const entry of readVcardEntries(item)) {
    if (!Array.isArray(entry) || entry.length < 4) {
      continue;
    }

    const [key, , , value] = entry;
    if (key !== "org") {
      continue;
    }

    if (Array.isArray(value) && typeof value[0] === "string") {
      return value[0];
    }

    if (typeof value === "string") {
      return value;
    }
  }

  return null;
}

function readPublicIds(item: Record<string, unknown>): SiteIntelRdapEntity["publicIds"] {
  if (!Array.isArray(item.publicIds)) {
    return [];
  }

  return item.publicIds
    .filter((publicId): publicId is Record<string, unknown> => Boolean(publicId && typeof publicId === "object"))
    .map((publicId) => ({
      type: typeof publicId.type === "string" ? publicId.type : null,
      identifier: typeof publicId.identifier === "string" ? publicId.identifier : null,
    }))
    .filter((publicId) => publicId.type || publicId.identifier);
}

function extractRdapEntities(payload: Record<string, unknown> | null): SiteIntelRdapEntity[] {
  if (!payload || !Array.isArray(payload.entities)) {
    return [];
  }

  const entities: SiteIntelRdapEntity[] = [];

  const visitEntity = (entity: unknown, parentHandle: string | null) => {
    if (!entity || typeof entity !== "object") {
      return;
    }

    const item = entity as Record<string, unknown>;
    const handle = typeof item.handle === "string" ? item.handle : null;

    entities.push({
      handle,
      parentHandle,
      roles: Array.isArray(item.roles)
        ? item.roles.filter((role): role is string => typeof role === "string")
        : [],
      name: readVcardString(item, "fn"),
      organization: readVcardOrganization(item),
      email: readVcardString(item, "email"),
      publicIds: readPublicIds(item),
    });

    if (Array.isArray(item.entities)) {
      for (const child of item.entities) {
        visitEntity(child, handle);
      }
    }
  };

  for (const entity of payload.entities) {
    visitEntity(entity, null);
  }

  return entities;
}

function readRdapRegisteredDomain(payload: Record<string, unknown> | null): string | null {
  if (!payload) {
    return null;
  }

  if (typeof payload.ldhName === "string" && payload.ldhName.trim()) {
    return payload.ldhName.trim().toLowerCase();
  }

  if (typeof payload.handle === "string" && payload.handle.trim().includes(".")) {
    return payload.handle.trim().toLowerCase();
  }

  return null;
}

function readRdapSelfUrl(payload: Record<string, unknown> | null, fallbackDomain: string | null): string | null {
  if (payload && Array.isArray(payload.links)) {
    for (const link of payload.links) {
      if (!link || typeof link !== "object") {
        continue;
      }

      const item = link as Record<string, unknown>;
      const rel = typeof item.rel === "string" ? item.rel : null;
      const href = typeof item.href === "string" ? item.href : null;

      if (href && rel === "self") {
        return href;
      }
    }
  }

  return fallbackDomain ? `https://rdap.org/domain/${encodeURIComponent(fallbackDomain)}` : null;
}

function roleWeight(roles: string[]): number {
  const normalizedRoles = roles.map((role) => role.toLowerCase());

  if (normalizedRoles.includes("registrant")) {
    return 1_000;
  }

  if (normalizedRoles.includes("administrative")) {
    return 800;
  }

  if (normalizedRoles.includes("technical")) {
    return 600;
  }

  if (normalizedRoles.includes("abuse")) {
    return 500;
  }

  if (normalizedRoles.includes("billing")) {
    return 400;
  }

  return 100;
}

function selectRegistrantEntity(entities: SiteIntelRdapEntity[]): SiteIntelRdapEntity | null {
  return (
    [...entities].sort((left, right) => roleWeight(right.roles) - roleWeight(left.roles))[0] ?? null
  );
}

function selectRdapEmailEntity(entities: SiteIntelRdapEntity[]): SiteIntelRdapEntity | null {
  const withEmail = entities.filter((entity) => entity.email);
  return (
    [...withEmail].sort((left, right) => roleWeight(right.roles) - roleWeight(left.roles))[0] ?? null
  );
}

function readPreferredPublicId(entity: SiteIntelRdapEntity | null): string | null {
  if (!entity) {
    return null;
  }

  return (
    entity.publicIds.find((publicId) => publicId.type?.toLowerCase() === "cnpj")?.identifier ??
    entity.publicIds.find((publicId) => publicId.identifier)?.identifier ??
    null
  );
}

function buildDomainOwnerCandidates(
  params: {
    rdapEntities: SiteIntelRdapEntity[];
    registeredDomain: string | null;
    rdapSourceUrl: string | null;
  },
): SiteIntelDomainOwnerCandidate[] {
  return params.rdapEntities
    .filter(
      (entity) =>
        entity.name ||
        entity.organization ||
        entity.email ||
        entity.publicIds.some((publicId) => publicId.identifier),
    )
    .map((entity) => ({
      handle: entity.handle,
      registeredDomain: params.registeredDomain,
      name: entity.name,
      organization: entity.organization,
      document: readPreferredPublicId(entity),
      email: entity.email,
      sourceType: "rdap",
      sourceUrl: params.rdapSourceUrl,
      contactStatus: entity.email ? "found" : "missing",
      roles: entity.roles,
    }));
}

function buildDomainOwnerContact(params: {
  registeredDomain: string | null;
  rdapEntities: SiteIntelRdapEntity[];
  rdapSourceUrl: string | null;
  fallbackEmailCandidate: SiteIntelContactCandidate | null;
}): SiteIntelDomainOwnerContact {
  const registrant = selectRegistrantEntity(params.rdapEntities);
  const emailEntity = selectRdapEmailEntity(params.rdapEntities);
  const sourceEntity = emailEntity ?? registrant;
  const fallbackEmail = params.fallbackEmailCandidate?.value ?? null;

  return {
    registeredDomain: params.registeredDomain,
    name: registrant?.name ?? sourceEntity?.name ?? null,
    organization: registrant?.organization ?? sourceEntity?.organization ?? null,
    document: readPreferredPublicId(registrant) ?? readPreferredPublicId(sourceEntity),
    email: emailEntity?.email ?? fallbackEmail,
    sourceType: emailEntity?.email ? "rdap" : fallbackEmail ? "public_site" : "none",
    sourceUrl: emailEntity?.email ? params.rdapSourceUrl : params.fallbackEmailCandidate?.sourceUrl ?? null,
    contactStatus: emailEntity?.email ? "found" : fallbackEmail ? "fallback" : "missing",
    roles: sourceEntity?.roles ?? [],
  };
}

function pageCategoryWeight(category: SiteIntelPageCategory): number {
  switch (category) {
    case "contact":
      return 400;
    case "about":
      return 300;
    case "policy":
    case "terms":
      return 250;
    case "source":
      return 200;
    default:
      return 100;
  }
}

function candidateWeight(candidate: SiteIntelContactCandidate): number {
  let score = pageCategoryWeight(candidate.pageCategory ?? "other");

  if (candidate.sourceType === "mailto") {
    score += 75;
  }

  if (candidate.sourceType === "rdap") {
    score = 50;
  }

  return score;
}

function selectPrimaryCandidate(
  candidates: SiteIntelContactCandidate[],
  type: SiteIntelCandidateType,
): SiteIntelContactCandidate | null {
  const filtered = candidates.filter((candidate) => candidate.type === type);
  if (filtered.length === 0) {
    return null;
  }

  return [...filtered].sort((left, right) => candidateWeight(right) - candidateWeight(left))[0];
}

function extractPageFinding(page: HtmlPage, pageCategory: SiteIntelPageCategory): SiteIntelPageFinding {
  const cleanedHtml = stripHtml(page.html);
  const mailtoLinks = unique(
    [...page.html.matchAll(MAILTO_REGEX)]
      .map((match) => {
        try {
          return decodeURIComponent(match[1]);
        } catch {
          return match[1];
        }
      })
      .filter(Boolean),
  ).slice(0, 10);

  return {
    url: page.url,
    finalUrl: page.finalUrl,
    title: readTitle(page.html),
    contentType: page.contentType,
    pageCategory,
    emails: unique(cleanedHtml.match(EMAIL_REGEX) ?? []).slice(0, 10),
    phones: unique(cleanedHtml.match(PHONE_REGEX) ?? []).slice(0, 10),
    cnpjCandidates: unique(cleanedHtml.match(CNPJ_REGEX) ?? []).slice(0, 10),
    mailtoLinks: mailtoLinks.slice(0, 10),
  };
}

function candidatesFromPageFinding(finding: SiteIntelPageFinding): SiteIntelContactCandidate[] {
  return [
    ...finding.emails.map((value) => ({
      type: "email" as const,
      value,
      sourceUrl: finding.finalUrl,
      sourceType: "page_content" as const,
      pageCategory: finding.pageCategory,
    })),
    ...finding.mailtoLinks.map((value) => ({
      type: "email" as const,
      value,
      sourceUrl: finding.finalUrl,
      sourceType: "mailto" as const,
      pageCategory: finding.pageCategory,
    })),
    ...finding.phones.map((value) => ({
      type: "phone" as const,
      value,
      sourceUrl: finding.finalUrl,
      sourceType: "page_content" as const,
      pageCategory: finding.pageCategory,
    })),
    ...finding.cnpjCandidates.map((value) => ({
      type: "cnpj" as const,
      value,
      sourceUrl: finding.finalUrl,
      sourceType: "page_content" as const,
      pageCategory: finding.pageCategory,
    })),
  ];
}

function dedupeCandidates(candidates: SiteIntelContactCandidate[]): SiteIntelContactCandidate[] {
  const seen = new Set<string>();
  const result: SiteIntelContactCandidate[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.type}:${candidate.value.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(candidate);
  }

  return result;
}

export async function collectPublicSiteIntel(params: {
  sourceUrl: string;
  maxPages?: number;
  requestTimeoutMs?: number;
}): Promise<SiteIntelInvestigationResult> {
  const maxPages = params.maxPages ?? env.SITE_INTEL_MAX_PAGES;
  const requestTimeoutMs = params.requestTimeoutMs ?? env.SITE_INTEL_REQUEST_TIMEOUT_MS;

  const sourcePage = await fetchHtmlPage(params.sourceUrl, requestTimeoutMs);
  const sourceFinalUrl = sourcePage?.finalUrl ?? params.sourceUrl;
  const domain = readDomain(sourceFinalUrl);
  const rdapPayload = domain ? await fetchRdapPayload(domain, requestTimeoutMs) : null;
  const rdapEntities = extractRdapEntities(rdapPayload);
  const registeredDomain = readRdapRegisteredDomain(rdapPayload) ?? domain;
  const rdapSourceUrl = readRdapSelfUrl(rdapPayload, registeredDomain);

  const pagesToVisit: string[] = [params.sourceUrl];
  const visited = new Set<string>();
  const pageFindings: SiteIntelPageFinding[] = [];

  while (pagesToVisit.length > 0 && pageFindings.length < maxPages) {
    const nextUrl = pagesToVisit.shift();
    if (!nextUrl || visited.has(nextUrl) || isProbablyBinary(nextUrl)) {
      continue;
    }

    visited.add(nextUrl);
    const page = nextUrl === params.sourceUrl && sourcePage ? sourcePage : await fetchHtmlPage(nextUrl, requestTimeoutMs);

    if (!page) {
      continue;
    }

    const pageCategory = classifyPage(page.finalUrl, pageFindings.length === 0);
    const finding = extractPageFinding(page, pageCategory);
    pageFindings.push(finding);

    if (!domain) {
      continue;
    }

    const links = extractLinks(page.html, page.finalUrl, domain);
    for (const link of links) {
      if (
        !visited.has(link) &&
        !pagesToVisit.includes(link) &&
        pagesToVisit.length + pageFindings.length < maxPages
      ) {
        pagesToVisit.push(link);
      }
    }
  }

  const contactCandidates = dedupeCandidates([
    ...pageFindings.flatMap(candidatesFromPageFinding),
    ...rdapEntities
      .filter((entity) => entity.email)
      .map((entity) => ({
        type: "rdap_email" as const,
        value: entity.email as string,
        sourceUrl: rdapSourceUrl ?? sourceFinalUrl,
        sourceType: "rdap" as const,
        pageCategory: null,
      })),
  ]);

  const fallbackEmailCandidate = selectPrimaryCandidate(contactCandidates, "email");
  const domainOwner = buildDomainOwnerContact({
    registeredDomain,
    rdapEntities,
    rdapSourceUrl,
    fallbackEmailCandidate,
  });
  const domainOwnerCandidates = buildDomainOwnerCandidates({
    rdapEntities,
    registeredDomain,
    rdapSourceUrl,
  });
  const primaryEmail =
    [...contactCandidates]
      .filter((candidate) => candidate.type === "email" || candidate.type === "rdap_email")
      .sort((left, right) => candidateWeight(right) - candidateWeight(left))[0]?.value ?? null;
  const primaryPhone = selectPrimaryCandidate(contactCandidates, "phone")?.value ?? null;
  const primaryCnpj = selectPrimaryCandidate(contactCandidates, "cnpj")?.value ?? null;
  const primaryEmailCandidate = [...contactCandidates]
    .filter((candidate) => candidate.type === "email" || candidate.type === "rdap_email")
    .sort((left, right) => candidateWeight(right) - candidateWeight(left))[0];
  const primaryContactPageUrl =
    primaryEmailCandidate?.pageCategory === "contact"
      ? primaryEmailCandidate.sourceUrl
      : contactCandidates.find((candidate) => candidate.pageCategory === "contact")?.sourceUrl ?? null;

  return {
    domain,
    registeredDomain,
    sourceUrl: params.sourceUrl,
    finalUrl: sourceFinalUrl,
    rdapPayload,
    rdapEntities,
    domainOwner,
    domainOwnerCandidates,
    pageFindings,
    contactCandidates,
    primaryEmail,
    primaryPhone,
    primaryCnpj,
    primaryContactPageUrl,
  };
}

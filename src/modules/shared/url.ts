export function canonicalizeUrl(input: string | null | undefined): string {
  if (!input) {
    return "";
  }

  try {
    const parsed = new URL(input);
    parsed.hash = "";

    if (
      (parsed.protocol === "https:" && parsed.port === "443") ||
      (parsed.protocol === "http:" && parsed.port === "80")
    ) {
      parsed.port = "";
    }

    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";

    const searchParams = [...parsed.searchParams.entries()]
      .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
        const keyComparison = leftKey.localeCompare(rightKey);

        if (keyComparison !== 0) {
          return keyComparison;
        }

        return leftValue.localeCompare(rightValue);
      })
      .filter(([key]) => !key.toLowerCase().startsWith("utm_"));

    parsed.search = "";

    for (const [key, value] of searchParams) {
      parsed.searchParams.append(key, value);
    }

    return parsed.toString();
  } catch {
    return input.trim();
  }
}

export function extractDomain(input: string): string | null {
  try {
    return new URL(input).hostname.toLowerCase();
  } catch {
    return null;
  }
}

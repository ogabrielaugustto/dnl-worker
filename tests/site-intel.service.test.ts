import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.INTERNAL_API_SECRET = "test-secret";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.R2_ACCOUNT_ID = "test-account";
process.env.R2_ACCESS_KEY_ID = "test-access-key";
process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
process.env.R2_BUCKET_ASSETS = "test-assets";
process.env.R2_BUCKET_EVIDENCE = "test-evidence";

const { collectPublicSiteIntel } = await import("../src/modules/site-intel/site-intel.service.ts");

const originalFetch = globalThis.fetch;

function htmlResponse(body: string, url: string, status = 200, contentType = "text/html") {
  return new Response(body, {
    status,
    headers: {
      "content-type": contentType,
    },
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

test.after(() => {
  globalThis.fetch = originalFetch;
});

test("collects public site intel and prioritizes contact-page data over RDAP", async () => {
  const seenUrls: string[] = [];

  globalThis.fetch = async (input) => {
    const url = String(input);
    seenUrls.push(url);

    if (url === "https://site.example/post") {
      return htmlResponse(
        `
          <html>
            <head>
              <title>Post</title>
              <meta name="description" content="Pagina de ocorrencia">
            </head>
            <body>
              <a href="/contato">Contato</a>
              <a href="/privacy">Privacidade</a>
              <a href="https://outside.example/contact">Fora</a>
              contato inicial: inicial@site.example
            </body>
          </html>
        `,
        url,
      );
    }

    if (url === "https://site.example/contato") {
      return htmlResponse(
        `
          <html>
            <body>
              Fale conosco em contato@site.example
              <a href="mailto:juridico@site.example">Jurídico</a>
              Telefone: (11) 99999-0000
              CNPJ 12.345.678/0001-90
            </body>
          </html>
        `,
        url,
      );
    }

    if (url === "https://site.example/privacy") {
      return htmlResponse("<html><body>privacy@site.example</body></html>", url);
    }

    if (url === "https://rdap.org/domain/site.example") {
      return jsonResponse({
        ldhName: "site.example",
        entities: [
          {
            handle: "ABC123",
            roles: ["registrant"],
            vcardArray: [
              "vcard",
              [
                ["fn", {}, "text", "Site Example LLC"],
                ["org", {}, "text", ["Site Example LLC"]],
                ["email", {}, "text", "owner@rdap.example"],
              ],
            ],
          },
        ],
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const result = await collectPublicSiteIntel({
    sourceUrl: "https://site.example/post",
    maxPages: 10,
    requestTimeoutMs: 8_000,
  });

  assert.equal(result.domain, "site.example");
  assert.equal(result.primaryEmail, "contato@site.example");
  assert.equal(result.primaryPhone, "(11) 99999-0000");
  assert.equal(result.primaryCnpj, "12.345.678/0001-90");
  assert.equal(result.primaryContactPageUrl, "https://site.example/contato");
  assert.equal(result.pageFindings.length, 3);
  assert.ok(result.contactCandidates.some((item) => item.value === "owner@rdap.example"));
  assert.ok(!result.pageFindings.some((item) => item.url === "https://outside.example/contact"));
  assert.deepEqual(
    seenUrls.filter((url) => url.startsWith("https://site.example")),
    ["https://site.example/post", "https://site.example/contato", "https://site.example/privacy"],
  );
});

test("ignores non-html pages and never exceeds the configured crawl limit", async () => {
  const seenUrls: string[] = [];

  globalThis.fetch = async (input) => {
    const url = String(input);
    seenUrls.push(url);

    if (url === "https://limited.example/post") {
      return htmlResponse(
        `
          <html>
            <body>
              <a href="/contato">Contato</a>
              <a href="/sobre">Sobre</a>
              <a href="/media.pdf">PDF</a>
              <a href="/termos">Termos</a>
            </body>
          </html>
        `,
        url,
      );
    }

    if (url === "https://limited.example/contato") {
      return htmlResponse("<html><body>contato@limited.example</body></html>", url);
    }

    if (url === "https://limited.example/sobre") {
      return htmlResponse("<html><body>sobre@limited.example</body></html>", url);
    }

    if (url === "https://limited.example/media.pdf") {
      return htmlResponse("%PDF-1.7", url, 200, "application/pdf");
    }

    if (url === "https://rdap.org/domain/limited.example") {
      return jsonResponse({ ldhName: "limited.example", entities: [] });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const result = await collectPublicSiteIntel({
    sourceUrl: "https://limited.example/post",
    maxPages: 3,
    requestTimeoutMs: 8_000,
  });

  assert.equal(result.pageFindings.length, 3);
  assert.ok(result.pageFindings.every((item) => item.contentType === "text/html"));
  assert.equal(result.primaryEmail, "contato@limited.example");
  assert.deepEqual(
    seenUrls.filter((url) => url.startsWith("https://limited.example")),
    ["https://limited.example/post", "https://limited.example/contato", "https://limited.example/sobre"],
  );
});

test("falls back to RDAP email when the site exposes no public contact email", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);

    if (url === "https://rdap-only.example/post") {
      return htmlResponse("<html><body>sem contato publico aqui</body></html>", url);
    }

    if (url === "https://rdap.org/domain/rdap-only.example") {
      return jsonResponse({
        ldhName: "rdap-only.example",
        entities: [
          {
            handle: "RDAP-1",
            roles: ["registrant"],
            vcardArray: [
              "vcard",
              [
                ["fn", {}, "text", "RDAP Owner"],
                ["email", {}, "text", "owner@rdap-only.example"],
              ],
            ],
          },
        ],
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const result = await collectPublicSiteIntel({
    sourceUrl: "https://rdap-only.example/post",
    maxPages: 10,
    requestTimeoutMs: 8_000,
  });

  assert.equal(result.primaryEmail, "owner@rdap-only.example");
  assert.equal(result.primaryContactPageUrl, null);
});

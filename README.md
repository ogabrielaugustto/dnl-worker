# dnl-worker

Operational worker service for DNL (Direito Na Lente). This repository owns the shared Supabase schema and runs the heavy monitoring pipeline: scheduler, BullMQ workers, Google Vision web detection, directed source crawling, Playwright screenshots, and private evidence uploads to Cloudflare R2.

## Stack

- Node.js 20+
- TypeScript
- Fastify
- Supabase
- BullMQ + Redis
- Google Cloud Vision
- Playwright
- Sharp
- Cloudflare R2

## What this worker does

- Creates recurring `scan_jobs` from due `monitoring_rules`
- Enqueues and processes scan jobs with BullMQ
- Calls Google Vision using the primary asset file public URL
- Crawls configured public sources by sitemap/RSS/home discovery
- Extracts page images and compares them against active asset fingerprints with perceptual hashes
- Upserts deduplicated `detections`
- Captures page screenshots for new or missing evidence
- Preserves the matched image itself alongside the page screenshot
- Stores a lightweight site snapshot with domain, page metadata, and owner hints
- Uploads evidence artifacts to a private R2 bucket
- Tracks execution state in `scan_jobs`, `scan_runs`, and `detection_evidences`

## Setup

```bash
npm install
cp .env.example .env
```

Required environment variables:

```env
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
REDIS_URL=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_ASSETS=
R2_BUCKET_EVIDENCE=
INTERNAL_API_SECRET=
```

Google Vision requires a service account file:

```env
GOOGLE_CLOUD_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

O worker usa `SUPABASE_URL` e `SUPABASE_SECRET_KEY` como contrato principal. `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` continuam aceitos apenas como compatibilidade.

## Run

```bash
npm run dev
```

The HTTP service starts on `http://localhost:3333` and the same process also starts:

- the recurring scheduler loop
- the BullMQ `scan-jobs` worker
- the BullMQ `capture-evidence` worker
- the BullMQ `source-crawl` worker

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run typecheck
npm run db:new -- migration_name
npm run db:push
npm run db:remote-commit
```

## Database workflow

Supabase migrations live in [supabase/migrations](/C:/github/dnl-worker/supabase/migrations). The worker repo is the schema owner for both `dnl-worker` and `dnl-platform`.

Recommended flow:

```bash
npx supabase link --project-ref your-project-ref
npm run db:push
```

The operational runtime migration adds:

- `scan_jobs.dedupe_key`, queue metadata and locking metadata
- `scan_runs.context`
- `detection_evidences.source_url_snapshot`
- `detection_evidences.matched_image_storage_key`
- `detection_evidences.matched_image_url_snapshot`
- `worker_schedule_due_scan_jobs()` for atomic recurring scheduling

The directed crawl migration adds:

- `monitored_sources` for global admin-managed source domains
- `source_crawl_runs` for source crawl attempts and counters
- `crawled_pages` for discovered/visited pages
- `discovered_images` for extracted page images and perceptual hashes

## Internal endpoints

Public:

- `GET /health`

Protected with `x-internal-secret`:

- `POST /internal/scheduler/run`
- `POST /internal/jobs/run`
- `POST /internal/jobs/:id/run`
- `POST /internal/sources/:id/crawl`
- `GET /internal/metrics`
- `POST /internal/vision/test`
- `POST /internal/screenshots/test`

## Examples

Health:

```bash
curl http://localhost:3333/health
```

Run scheduler manually:

```bash
curl -X POST http://localhost:3333/internal/scheduler/run \
  -H "x-internal-secret: change-me"
```

Re-enqueue pending jobs:

```bash
curl -X POST http://localhost:3333/internal/jobs/run \
  -H "x-internal-secret: change-me"
```

Get metrics:

```bash
curl http://localhost:3333/internal/metrics \
  -H "x-internal-secret: change-me"
```

Run a monitored source crawl:

```bash
curl -X POST http://localhost:3333/internal/sources/SOURCE_UUID/crawl \
  -H "x-internal-secret: change-me"
```

Screenshot test:

```bash
curl -X POST http://localhost:3333/internal/screenshots/test \
  -H "content-type: application/json" \
  -H "x-internal-secret: change-me" \
  -d "{\"url\":\"https://example.com\"}" \
  --output screenshot.png
```

Vision test:

```bash
curl -X POST http://localhost:3333/internal/vision/test \
  -H "content-type: application/json" \
  -H "x-internal-secret: change-me" \
  -d "{\"imageUrl\":\"https://example.com/image.jpg\"}"
```

## Notes

- Do not commit `.env`, Google credentials, or service role secrets.
- `dnl-platform` should create assets, asset files, monitoring rules, and manual jobs; the worker owns execution.
- `dnl-platform` may manage global `monitored_sources`; the worker owns crawling, matching, and evidence capture.
- Screenshots and preserved matched images are stored privately in R2; consumer-facing signed URLs should be handled later by the platform or a dedicated internal endpoint.

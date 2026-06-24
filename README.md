# dnl-worker

Operational worker service for DNL (Direito Na Lente). This repository owns the shared Supabase schema and runs the heavy monitoring pipeline: scheduler, BullMQ workers, Google Vision web detection, Playwright screenshots, and private evidence uploads to Cloudflare R2.

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
- Upserts deduplicated `detections`
- Captures page screenshots for new or missing evidence
- Preserves the matched image itself alongside the page screenshot
- Stores a lightweight site snapshot with domain and page metadata during evidence capture
- Submits newly found source pages to the Internet Archive Wayback Machine once per detection
- Runs a separate public site-intel investigation only after a detection is marked as `unauthorized`
- Stores the latest confirmed Wayback snapshot plus a small local timeline summary
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
SUPABASE_SERVICE_ROLE_KEY=
REDIS_URL=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_ASSETS=
R2_BUCKET_EVIDENCE=
INTERNAL_API_SECRET=
VISION_WEB_DETECTION_MAX_RESULTS=50
VISION_MIN_CONFIDENCE_SCORE=0.75
WAYBACK_ENABLED=true
WAYBACK_SUBMISSION_INTERVAL_MS=15000
SITE_INTEL_MAX_PAGES=10
SITE_INTEL_REQUEST_TIMEOUT_MS=8000
```

Google Vision requires a service account file:

```env
GOOGLE_CLOUD_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

O worker usa `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` como contrato principal. `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SECRET_KEY` continuam aceitos apenas como compatibilidade.

## Run

```bash
npm run dev
```

The HTTP service starts on `http://localhost:3333` and the same process also starts:

- the recurring scheduler loop
- the BullMQ `scan-jobs` worker
- the BullMQ `capture-evidence` worker
- the BullMQ `wayback-capture` worker
- the BullMQ `site-intel` worker

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
- `detection_wayback_captures` for one-time Wayback save requests plus timeline metadata
- `detection_site_intel_investigations` for post-`unauthorized` public contact and domain enrichment
- `worker_schedule_due_scan_jobs()` for atomic recurring scheduling

The directed crawl cleanup migration removes the old portal crawler tables:

- `monitored_sources`
- `source_seed_urls`
- `source_crawl_runs`
- `crawled_pages`
- `discovered_images`
- `asset_files.phash`

Image search is performed only through Google Vision Web Detection. `VISION_WEB_DETECTION_MAX_RESULTS` asks Vision for more WEB_DETECTION results, and `VISION_MIN_CONFIDENCE_SCORE` controls how permissive candidate normalization is before human validation. Google Vision does not expose an official age/date-range parameter, so the worker cannot force a "last 20 years" search window.

## Internal endpoints

Public:

- `GET /health`

Protected with `x-internal-secret`:

- `POST /internal/scheduler/run`
- `POST /internal/jobs/run`
- `POST /internal/jobs/:id/run`
- `GET /internal/metrics`
- `POST /internal/vision/test`
- `POST /internal/screenshots/test`
- `POST /internal/wayback/test`
- `POST /internal/site-intel/:id/run`

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

Wayback test:

```bash
curl -X POST http://localhost:3333/internal/wayback/test \
  -H "content-type: application/json" \
  -H "x-internal-secret: change-me" \
  -d "{\"url\":\"https://example.com\"}"
```

Run post-`unauthorized` public site-intel investigation:

```bash
curl -X POST http://localhost:3333/internal/site-intel/00000000-0000-4000-8000-000000000000/run \
  -H "content-type: application/json" \
  -H "x-internal-secret: change-me" \
  -d "{\"force\":true}"
```

## Notes

- Do not commit `.env`, Google credentials, or service role secrets.
- `dnl-platform` should create assets, asset files, monitoring rules, and manual jobs; the worker owns execution.
- Web image discovery is intentionally limited to Google Vision. Do not add portal/source crawling back into this worker.
- Screenshots and preserved matched images are stored privately in R2; consumer-facing signed URLs should be handled later by the platform or a dedicated internal endpoint.
- Wayback integration uses the public Save Page Now flow plus Availability/CDX follow-up checks. It is best-effort and throttled to one queued submission per interval.
- Site-intel investigation is intentionally bounded to free public signals on the detected domain and should not become a general crawler.

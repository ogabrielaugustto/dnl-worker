# dnl-worker

Internal worker service for DNL (Direito Na Lente). This repository is responsible for operational processing such as Google Cloud Vision web detection tests and Playwright screenshot capture. It is not the public backend and it does not contain frontend code.

This repository is also the current source of truth for the shared Supabase database schema used by both `dnl-worker` and `dnl-platform`.

## Requirements

- Node.js 20+
- npm
- Supabase CLI
- Google Cloud Vision credentials for Vision tests

## Setup

```bash
npm install
cp .env.example .env
```

Update `.env` with your internal secret and, when using Google Vision, configure `GOOGLE_APPLICATION_CREDENTIALS` to point to your local Google service account JSON file.

For database work, also configure:

```env
SUPABASE_URL=
SUPABASE_SECRET_KEY=
```

The worker should use the Supabase service role key only on trusted backend paths. The platform should later use Supabase Auth and the publishable key with RLS-enabled queries.

## Run

```bash
npm run dev
```

The server starts on `http://localhost:3333` by default.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run typecheck
```

## Database workflow

Supabase migrations live in [supabase/migrations](/C:/github/dnl-worker/supabase/migrations) and are written by hand in SQL so RLS, policies, helper functions, triggers, and indexes stay explicit.

Available database scripts:

```bash
npm run db:new -- name_of_migration
npm run db:push
npm run db:remote-commit
```

This repository does not use Docker or a local Supabase database. The workflow is remote-first against the linked Supabase project.

Recommended flow:

```bash
npx supabase link --project-ref your-project-ref
npm run db:push
```

What the initial migration sets up:

- Multi-tenant tenant model with `organizations` and `organization_members`
- `profiles` synced from `auth.users`
- Lean SaaS subscription tables
- Core monitoring tables for assets, monitoring rules, jobs, runs, detections, evidences, and actions
- RLS on every app-facing table
- Helper functions and policies for tenant isolation
- Base plans seeded through a regular SQL migration

Important implementation notes:

- `dnl-worker` is the migration owner and trusted service-role consumer
- `dnl-platform` should eventually connect directly to the same Supabase project through Auth + RLS
- Basic reference data must be added through normal migrations, not `seed.sql`
- Do not disable RLS for convenience
- Do not commit secrets or Google credential files
- File binaries belong in object storage; Postgres stores metadata and references only

## Test the health endpoint

```bash
curl http://localhost:3333/health
```

## Test screenshots

```bash
curl -X POST http://localhost:3333/internal/screenshots/test \
  -H "content-type: application/json" \
  -H "x-internal-secret: change-me" \
  -d '{"url":"https://example.com"}' \
  --output screenshot.png
```

## Test Google Vision

```bash
curl -X POST http://localhost:3333/internal/vision/test \
  -H "content-type: application/json" \
  -H "x-internal-secret: change-me" \
  -d '{"imageUrl":"https://example.com/image.jpg"}'
```

Google Vision only works when valid Google Cloud credentials are configured locally. Do not commit credential files into this repository.

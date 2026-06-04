# dnl-worker

Internal worker service for DNL (Direito Na Lente). This repository is responsible for operational processing such as Google Cloud Vision web detection tests and Playwright screenshot capture. It is not the public backend and it does not contain frontend code.

## Requirements

- Node.js 20+
- npm
- Google Cloud Vision credentials for Vision tests

## Setup

```bash
npm install
cp .env.example .env
```

Update `.env` with your internal secret and, when using Google Vision, configure `GOOGLE_APPLICATION_CREDENTIALS` to point to your local Google service account JSON file.

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

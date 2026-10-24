# Deployment

The live demo is at **https://docextract.jdecastro.dev**. This document covers running the
tool yourself with Docker, the environment variables, and how the demo server is set up.

## Run it with Docker (recommended)

Requirements: Docker with Compose v2. The image builds the frontend and the API into one
container that serves both on one port.

```bash
cp .env.example .env
# edit .env: set ANTHROPIC_API_KEY (or LLM_PROVIDER=mock for a key-less smoke test)
docker compose up --build
```

Open <http://localhost:3120>. The API answers on `/api/*` (`/api/health` reports the version,
model and budget). Uploads, parsed text, job records and results live in the named volume
`docextract-data`; delete it with `docker compose down -v` to start clean.

The container runs as a non-root user with a 1.5 GB memory limit and a healthcheck on
`/api/health`. Processing a 60 MB plan uses well under 1 GB.

## Run it without Docker (development)

Requirements: Node 24, pnpm 9.12.

```bash
pnpm install
cp .env.example .env            # set ANTHROPIC_API_KEY, set DATA_DIR=./data
pnpm dev                        # API on :3000 with pretty logs, Vite on :5173 proxying /api
```

Other scripts: `pnpm check` (typecheck, lint, format, unit tests), `pnpm e2e` (Playwright
journeys, see TESTING.md), `pnpm build`,
`pnpm extract-text file.pdf` (what the model sees), `pnpm run-pipeline file.pdf`
(one extraction from the command line), `pnpm eval` (accuracy harness, see TESTING.md).

## Environment variables

| Variable                   | Default           | Meaning                                                                                                                  |
| -------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ANTHROPIC_API_KEY`        |                   | Required unless `LLM_PROVIDER=mock`. Never commit it.                                                                    |
| `LLM_PROVIDER`             | `anthropic`       | `mock` returns canned items so the whole app runs without a key (clearly labelled in the UI).                            |
| `LLM_MODEL`                | `claude-opus-5-5` | Any current Claude model id. `claude-sonnet-5-5` is about half the cost.                                                 |
| `LLM_EFFORT`               | `high`            | `low`, `medium`, `high`, `xhigh`, `max`.                                                                                 |
| `LLM_MAX_OUTPUT_TOKENS`    | `16000`           | Per category call; longer outputs trigger a page split.                                                                  |
| `LLM_CATEGORY_CONCURRENCY` | `3`               | Parallel category calls after the first (cache-writing) one.                                                             |
| `DAILY_USD_CAP`            | `25`              | New uploads are refused above this estimated daily spend. `0` disables the cap.                                          |
| `MAX_UPLOAD_MB`            | `200`             | Upload size limit (the demo's nginx allows 256 MB).                                                                      |
| `MAX_DOC_TOKENS`           | `400000`          | Documents whose text exceeds this are rejected, not truncated.                                                           |
| `UPLOADS_PER_HOUR_PER_IP`  | `10`              | Rate limit on the upload routes.                                                                                         |
| `SOURCE_ZIP_URL`           |                   | Optional. When set, the header shows a "Source code (zip)" link to it (the demo serves the archive from `/submission/`). |
| `JOB_CONCURRENCY`          | `1`               | Documents processed at once.                                                                                             |
| `JOB_TIMEOUT_MIN`          | `20`              | Hard stop per document.                                                                                                  |
| `PORT`                     | `3000`            | Inside the container; compose publishes it on `HOST_PORT` (3120).                                                        |
| `DATA_DIR`                 | `/data`           | Uploads, caches, job records, budget ledger.                                                                             |
| `NODE_ENV`                 | `production`      | `development` enables CORS and pretty logs.                                                                              |
| `APP_VERSION`              | `dev`             | Set by the image build; shown in `/api/health` and the UI footer.                                                        |

`OPENAI_API_KEY` is accepted but unused: the extraction runs on Claude.

## How the demo server is deployed

A 2 GB Ubuntu 24.04 VPS with Docker, nginx and certbot. Nothing is built on the server: the
image is built on the developer machine, shipped over ssh, and switched with a health check
and automatic rollback.

1. **Bootstrap the box once** (`ops/bootstrap-box.sh <ip>`): packages, a deploy user (uid 1001,
   matching the container user), ufw, fail2ban, swap, nginx hardening, root/password SSH off.
2. **Secrets** live only on the box in `~/docextract/.env` (same keys as `.env.example`).
3. **nginx** (`ops/nginx/site.conf`) terminates TLS (Let's Encrypt via certbot webroot) and
   proxies to the container on loopback. The settings that matter for 100 MB+ PDFs:
   `client_max_body_size 256m`, `proxy_request_buffering off` (the upload streams straight to
   the app), `proxy_read_timeout 600s`, and a `limit_req` zone on `POST /api/documents`.
   The DNS record is **not** proxied through Cloudflare, whose free plan rejects request bodies
   over 100 MB.
4. **Deploy** (`ops/deploy.sh`): `pnpm check` → `pnpm e2e` → `docker build` → local smoke test of the image
   (health, frontend, samples, one mock extraction) → `docker save | ssh docker load` →
   `docker compose up -d` on the box → poll `/api/health` until it reports the new version,
   rolling back to the previous tag if it never does → prune old images → public check.
   `ops/deploy.sh --rollback` switches back by hand; `--nginx` installs the site and the
   certificate.

Logs: `ssh <box> 'cd ~/docextract && docker compose logs -f'`. The daily budget ledger is
`/data/budget.json` inside the volume.

## Other hosts

Any host that runs a Docker image with a persistent volume works (Railway, Render, Fly, a
VPS). Serverless platforms with request body limits (Vercel and Netlify functions, Cloudflare
proxies on the free plan) will reject the 100 MB+ uploads this tool is built for.

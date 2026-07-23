# KiwiJob release checklist

Use this when preparing a production cut (web + API + Chrome extension).

## Current production endpoints

- Web: `https://d1e26b7m2m2gck.cloudfront.net`
- API: `https://d3qngwzf3gjrpb.cloudfront.net`
- API origin: Elastic Beanstalk environment `Kiwijob-api-env`
- Resume storage: private S3 bucket with public access blocked and server-side encryption
- Extension release artifact: `releases/kiwijob-extension-0.2.0.zip` (generated locally; ZIP files are not committed)

The CloudFront endpoints provide production HTTPS. `app.kiwijob.co.nz` and
`api.kiwijob.co.nz` can replace them after DNS access is available and ACM
certificate validation records have been added.

## KiwiJob 1.0 (product scope)

Included in the first production-capable release:

- **API**: FastAPI + SQLModel; `/health`; jobs save/list/detail/update/delete; resumes upload/list; match analyze + read; analytics summary; PostgreSQL via `DATABASE_URL`; Alembic migrations; `CORS_ORIGINS` + `ENVIRONMENT`; Docker Compose with Postgres + API **healthchecks**.
- **Web**: Applications table, job detail (status, JD, match), CV upload, analytics; layout footer shows **API reachability**, base URL link to `/health`, and **Mock user id** (`localStorage` → `X-Mock-User-Id`, consistent with the extension).
- **Extension (MV3, Chrome 114+)**: Side panel; allowlisted job-site extraction after user action; manual Save and Match calls to the same API.

Explicitly **out of scope for 1.0**: ATS one-click autofill, referral/network graph, personalised job recommendations, real user auth.

## API

- Set `ENVIRONMENT=production`.
- Set `DATABASE_URL` to a managed Postgres URL (TLS recommended).
- Run `python -m alembic upgrade head` from `apps/api` before starting a new deployment.
- Set `CORS_ORIGINS` to explicit values: your web origin(s) (`https://…`) and each `chrome-extension://<extension-id>` origin for the MV3 build you ship (comma-separated). Avoid `*` in production unless you accept the risk.
- Set `OPENAI_API_KEY` in a secret store; never commit `.env`.
- Point `RESUME_STORAGE_DIR` at durable storage (volume / object storage adapter is a future step).
- Run behind HTTPS termination (reverse proxy or platform ingress).
- Keep `/health` wired for load balancers (already present).

## Web (`apps/web`)

- Build with `VITE_API_URL=https://<your-api-host>` (trailing slashes are stripped at runtime).
- Host static files on CDN or object storage + CDN; configure cache headers for hashed assets.

## Chrome extension

- Bump `version` in `apps/extension/public/manifest.json` per store rules.
- PNG toolbar icons live under `apps/extension/public/icons/` and are referenced in `manifest.json`. Regenerate with `npm run icons -w @kiwijob/extension` or `python3 scripts/render_icons.py` from `apps/extension`.
- **Privacy policy URL** for the store: publish this repo (or your fork) on GitHub and use a stable raw URL to [`docs/PRIVACY.md`](PRIVACY.md), for example  
  `https://raw.githubusercontent.com/<OWNER>/<REPO>/main/kiwijob/docs/PRIVACY.md`  
  Replace `<OWNER>/<REPO>` and branch name if your default branch is not `main`.
- Prepare the rest of the listing: single-purpose description, data usage (job URLs and content sent to **your** configured API only).
- **Suggested listing copy** (edit to match your deployment; English is typical for the store):

  **Name:** KiwiJob — Job save & CV match

  **Short description (132 chars max):** Save jobs from career sites, track status in a dashboard, and run JD↔CV match against your KiwiJob API.

  **Single purpose:** Help job seekers capture a job posting from the active tab, send it to their own KiwiJob backend for tracking, and optionally request a match score between the job description and an uploaded CV.

  **Permissions (plain language for reviewers):**
  - `storage`: remember your API base URL, web app URL, sign-in state, and selected resume.
  - `activeTab`: read the current supported job tab after you open KiwiJob or click Refresh detection.
  - `sidePanel`: show KiwiJob in Chrome’s side panel (Chrome 114+).
  - Job-site allowlist: inject the fixed content script only on the job boards and ATS hosts declared in `manifest.json`.

  **Host permissions / remote code:** You ship a fixed MV3 bundle; the extension does not fetch and execute arbitrary remote code. Network calls go to user-configured API endpoints.

- Side panel requires **Chrome 114+** (`minimum_chrome_version` is set in the manifest).

## CI

- GitHub Actions workflow: `.github/workflows/kiwijob-ci.yml` (builds Node workspaces, starts PostgreSQL, runs Alembic, then runs `python -m pytest` under `apps/api`). Root **`postinstall`** runs `scripts/ensure-rollup-native.cjs` so Vite gets the correct `@rollup/rollup-*` native binding after [npm optional-deps + workspaces](https://github.com/npm/cli/issues/4828) omit it.
- Run locally: `cd kiwijob && npm run ci` (requires Python 3.12+, `pip install -r apps/api/requirements.txt`, and local PostgreSQL reachable at `postgresql+psycopg2://kiwijob:kiwijob@localhost:5432/kiwijob_test` unless you override `DATABASE_URL`).
- If you cloned before this script existed: from `kiwijob/` run `npm install` once (or `node scripts/ensure-rollup-native.cjs`) so Rollup’s platform package is present, then `npm run dev -w @kiwijob/web`.

## Follow-ups (not in MVP)

- Real auth (replace `X-Mock-User-Id`).
- Rate limiting and upload virus scanning for `/resumes/upload`.
- Observability (structured logs, metrics, tracing).

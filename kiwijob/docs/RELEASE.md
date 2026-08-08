# KiwiJob release checklist

Use this when preparing a production cut (web + API + Chrome extension).

## Current production endpoints

- Web: `https://app.kiwijob.co.nz`
- API: `https://api.kiwijob.co.nz`
- CloudFront web endpoint: `https://d1e26b7m2m2gck.cloudfront.net`
- CloudFront API endpoint: `https://d3qngwzf3gjrpb.cloudfront.net`
- API origin: Elastic Beanstalk environment `Kiwijob-api-env`
- Resume storage: private S3 bucket with public access blocked and server-side encryption
- Extension release artifact: `releases/kiwijob-extension-0.2.9.zip` (generated locally; ZIP files are not committed)

The custom domains use CloudFront with an ACM certificate covering both
`app.kiwijob.co.nz` and `api.kiwijob.co.nz`. Keep the ACM DNS validation
CNAME records in place so AWS can renew the certificate automatically.

## KiwiJob 1.0 (product scope)

Included in the first production-capable release:

- **API**: FastAPI + SQLModel; liveness/readiness checks; email plus optional Google, LinkedIn, GitHub, and Apple authentication; account-scoped jobs, resumes, match analysis, CV optimization, copilot, and analytics; PostgreSQL/Alembic; durable rate limits; explicit CORS and production configuration validation.
- **Web**: Authenticated application tracker, job detail, CV upload/optimization, match analysis, copilot, analytics, account deletion, privacy notice, and terms.
- **Extension (MV3, Chrome 114+)**: Side panel; allowlisted job-site extraction after user action; manual Save and Match calls to the same API.

Explicitly **out of scope for 1.0**: referral/network graph and fully automatic application submission.

## API

- Set `ENVIRONMENT=production`.
- Set `DATABASE_URL` to a managed Postgres URL with `sslmode=require` (or stricter certificate verification).
- Run `python -m alembic upgrade head` from `apps/api` before starting a new deployment.
- Set `CORS_ORIGINS` to explicit values: your web origin(s) (`https://…`) and each `chrome-extension://<extension-id>` origin for the MV3 build you ship (comma-separated). Avoid `*` in production unless you accept the risk.
- Set `OPENAI_API_KEY` in a secret store; never commit `.env`.
- Set `JWT_SECRET_KEY` to a unique value of at least 32 characters and `SECURE_AUTH_COOKIE=true`.
- Set `API_PUBLIC_URL` to the public HTTPS API origin. For LinkedIn and GitHub setup, follow `docs/SOCIAL_LOGIN.md` and keep all client secrets in the deployment secret store.
- Set `RESUME_S3_BUCKET` to the private production bucket. Local filesystem storage is development-only.
- Keep `RATE_LIMIT_ENABLED=true`. Authentication limits are keyed by a hashed client address; CV uploads and AI generation are keyed by user.
- Run behind HTTPS termination (reverse proxy or platform ingress).
- Keep `/health` as the liveness check and wire `/ready` to deployment/readiness checks; `/ready` verifies PostgreSQL.

## Web (`apps/web`)

- Build with `VITE_API_URL=https://<your-api-host>` (trailing slashes are stripped at runtime).
- Host static files on CDN or object storage + CDN; configure cache headers for hashed assets.

## Chrome extension

- Bump `version` in `apps/extension/public/manifest.json` per store rules.
- Keep the workspace package version in sync, then run `npm run package:extension`. The command rebuilds the extension, verifies required files and version consistency, and writes `releases/kiwijob-extension-<version>.zip`.
- PNG toolbar icons live under `apps/extension/public/icons/` and are referenced in `manifest.json`. Regenerate with `npm run icons -w @kiwijob/extension` or `python3 scripts/render_icons.py` from `apps/extension`.
- **Privacy policy URL** for the store: use the public KiwiJob privacy page:
  `https://app.kiwijob.co.nz/privacy`
- Prepare the rest of the listing: single-purpose description, data usage (job URLs and content sent to **your** configured API only).
- **Suggested listing copy** (edit to match your deployment; English is typical for the store):

  **Name:** KiwiJob — Job save & CV match

  **Short description (132 chars max):** Save jobs from career sites, track status in a dashboard, and run JD↔CV match against your KiwiJob API.

  **Single purpose:** Help job seekers capture a job posting from the active tab, send it to their own KiwiJob backend for tracking, and optionally request a match score between the job description and an uploaded CV.

  **Permissions (plain language for reviewers):**
  - `storage`: remember your API base URL, web app URL, sign-in state, and selected resume.
  - `activeTab`: read the current supported job tab after you open KiwiJob or click Refresh detection.
  - `sidePanel`: show KiwiJob in Chrome’s side panel (Chrome 114+).
  - `tabs`: keep the side panel synchronized with the active supported job tab and open explicit dashboard links after a user action.
  - Job-site allowlist: inject the fixed content script only on the job boards and ATS hosts declared in `manifest.json`.

  **Host permissions / remote code:** You ship a fixed MV3 bundle; the extension does not fetch and execute arbitrary remote code. Network calls go to user-configured API endpoints.

- Side panel requires **Chrome 114+** (`minimum_chrome_version` is set in the manifest).
- Capture at least one real 1280×800 or 640×400 store screenshot from the packaged extension. Do not submit generated or reconstructed UI as a product screenshot.

## CI

- GitHub Actions workflow: `.github/workflows/kiwijob-ci.yml` (typechecks Web/Extension, builds Node workspaces, packages and uploads the extension artifact, starts PostgreSQL, runs Alembic, then runs `python -m pytest` under `apps/api`). Root **`postinstall`** runs `scripts/ensure-rollup-native.cjs` so Vite gets the correct `@rollup/rollup-*` native binding after [npm optional-deps + workspaces](https://github.com/npm/cli/issues/4828) omit it.
- Run locally: `cd kiwijob && npm run ci` (requires Python 3.12+, `pip install -r apps/api/requirements.txt`, and local PostgreSQL reachable at `postgresql+psycopg2://kiwijob:kiwijob@localhost:5432/kiwijob_test` unless you override `DATABASE_URL`).
- If you cloned before this script existed: from `kiwijob/` run `npm install` once (or `node scripts/ensure-rollup-native.cjs`) so Rollup’s platform package is present, then `npm run dev -w @kiwijob/web`.

## Remaining infrastructure follow-ups

- Attach malware scanning/quarantine to the production resume bucket.
- Enable CloudFront access logs, WAF rules, centralized error tracking, metrics, and alerts described in `docs/OPERATIONS.md`.

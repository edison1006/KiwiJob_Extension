# EasyJob (MVP)

All application code for this project lives under **`easyjob/`**. Clone the repo, then `cd easyjob` for installs, builds, and Docker Compose. **GitHub shows this file** (`README.md` at the repository root) on the repo home page.

EasyJob is a **Chrome Extension** + **React dashboard** + **FastAPI API** for saving job postings, tracking application status, uploading a CV (PDF/DOCX), and running an **AI JD ↔ CV match** analysis.

Monorepo layout (under `easyjob/`):

- `easyjob/apps/web` — Vite + React + TypeScript + Tailwind dashboard
- `easyjob/apps/extension` — Manifest V3 Chrome extension (content script + service worker + side panel)
- `easyjob/apps/api` — FastAPI + SQLModel + PostgreSQL API
- `easyjob/packages/shared` — Shared TypeScript contracts (`JobSavePayload`, statuses, DTO shapes)

## Prerequisites

- Node.js 20+ (recommended)
- Python **3.10+** recommended (Docker image uses **3.12**). The API pins `eval-type-backport` so **3.9** can still parse modern union annotations in many environments.
- Docker Desktop (optional, for `docker-compose`)

## Release builds & CI

- Checklist: [`easyjob/docs/RELEASE.md`](easyjob/docs/RELEASE.md) (production env, CORS, store listing; **1.0 product scope** is at the top of that file).
- Local CI-style run from `easyjob/`: `npm run ci` (Node builds + API tests via `python3 -m pytest`; install Python deps first: `pip install -r apps/api/requirements.txt`, or use `apps/api/.venv`).
- GitHub Actions: `.github/workflows/easyjob-ci.yml` (runs on pushes/PRs that touch `easyjob/**`). Root `postinstall` runs `easyjob/scripts/ensure-rollup-native.cjs` so Vite/Rollup works after `npm ci` on Linux and macOS (see [`easyjob/docs/RELEASE.md`](easyjob/docs/RELEASE.md) → CI).

## Quick start (local)

### 1) Database (optional for quick local API)

By default the API uses **SQLite** (`./data/easyjob.db`) so you can skip Postgres and Docker for local dev.

For **PostgreSQL** instead, start a server (example with Docker — requires Docker Desktop running):

```bash
docker run --name easyjob-pg -e POSTGRES_USER=easyjob -e POSTGRES_PASSWORD=easyjob -e POSTGRES_DB=easyjob -p 5432:5432 -d postgres:16-alpine
```

Then set `DATABASE_URL` in `easyjob/apps/api/.env` to the Postgres URL from `easyjob/.env.example` (commented block).

### Postgres user + database (local, one-time)

If you use **PostgreSQL** instead of SQLite, create role `easyjob` and database `easyjob` once:

```bash
cd easyjob
chmod +x scripts/setup-postgres.sh   # if you see "permission denied"
./scripts/setup-postgres.sh
# or without execute bit:
bash scripts/setup-postgres.sh
```

If the script cannot guess your superuser, specify it (Homebrew Postgres often uses your macOS login name):

```bash
cd easyjob
PGUSER=zhangxiaoyu bash scripts/setup-postgres.sh
# or:
PGUSER=postgres PGPASSWORD=your_password bash scripts/setup-postgres.sh
```

Manual option:

```bash
psql -U postgres -d postgres -f easyjob/scripts/postgres-init.sql
```

Then in `easyjob/apps/api/.env` set:

`DATABASE_URL=postgresql+psycopg2://easyjob:easyjob@localhost:5432/easyjob`

### 2) API

```bash
cd easyjob/apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ../../.env.example .env
# Default .env uses SQLite — no Postgres needed. For Postgres, edit DATABASE_URL in .env.
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Important:** run `uvicorn` only from `easyjob/apps/api` (where the `app/` package lives). If you see `No module named 'app'`, you are in the wrong directory. From repo root you can use:

```bash
bash easyjob/apps/api/dev.sh
```

If you previously created `.venv` while the folder was named `jobsync-ai`, you may see **`bad interpreter: .../jobsync-ai/.../python3`**. Delete the broken venv and recreate:

```bash
cd easyjob/apps/api
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3) Web dashboard

```bash
cd easyjob
npm install
cd apps/web
cp ../../.env.example .env.local
# set VITE_API_URL=http://localhost:8000
npm run dev
```

Open `http://localhost:5173`. Main areas: **Home** (`/`), **Job tracker** (`/tracker`), **Documents** (`/documents`; `/cv` redirects here), **Matches** (`/matches`). **Analytics** (`/analytics`) is linked from Home.

### 4) Chrome extension

```bash
cd easyjob
npm run build -w @easyjob/extension
```

Then in Chrome (**114+**, Side Panel API): **Extensions → Load unpacked →** select `easyjob/apps/extension/dist`.

Notes:

- **Open the UI:** click the EasyJob toolbar icon — the **side panel** opens (no popup). You can dock it on the left or right with Chrome’s side panel controls.
- **Where to use it:** open a normal **https** job posting first. On `chrome://extensions` or other built-in pages, capture is disabled by design — you will see a hint in the side panel.
- **Service worker “inactive”** in `chrome://extensions` is normal until the extension wakes it (e.g. save/analyze).
- **Toolbar icons:** `easyjob/apps/extension/public/manifest.json` references PNGs in `easyjob/apps/extension/public/icons/`. Regenerate with `npm run icons -w @easyjob/extension` (or `python3 scripts/render_icons.py` from `easyjob/apps/extension`) and rebuild.
- **Privacy policy (Chrome Web Store):** see [`easyjob/docs/PRIVACY.md`](easyjob/docs/PRIVACY.md). Use a public raw GitHub URL to that file on your default branch in the listing (pattern in [`easyjob/docs/RELEASE.md`](easyjob/docs/RELEASE.md)).
- Set **API base URL** in the side panel (defaults to `http://localhost:8000`).
- Optional **Mock user id** header maps to `X-Mock-User-Id` (defaults to `1`).

## Docker Compose (API + Postgres)

From `easyjob/`:

```bash
cp .env.example .env
docker compose up --build
```

API: `http://localhost:8000`  
Postgres: `localhost:5432` (`easyjob` / `easyjob`)

## API highlights (MVP)

Mock auth: send `X-Mock-User-Id` (optional). Default user `1` is auto-created.

- `POST /jobs/save` — upserts `JobPost` by URL and upserts `Application` for the user
- `GET /jobs`, `GET /jobs/{job_id}`, `PUT /jobs/{job_id}`, `DELETE /jobs/{job_id}`  
  (`job_id` is the **application / tracker row id**)
- `POST /resumes/upload`, `GET /resumes`
- `POST /match/analyze` — body `{ "job_id": <applicationId> }`. If `OPENAI_API_KEY` is **unset or blank**, the mock scorer runs on the **JD alone** (no CV required). If a **non-empty** key is set, a resume with extracted text is required.
- `GET /match/{job_id}` — latest stored match JSON
- `GET /analytics/summary`

If `OPENAI_API_KEY` is missing, match analysis uses a small deterministic **mock scorer** so the UI still works.

## Architecture notes (future hooks)

- `EmailEvent` and `Notification` tables exist as **stubs** for later Gmail ingestion + in-app alerts.
- Extension `siteExtractors` registry is ready for SEEK / LinkedIn / Indeed / Trade Me / career-site parsers without changing the pipeline.

## Scripts (from `easyjob/`)

```bash
cd easyjob
npm install          # workspaces; postinstall fixes Rollup native + builds shared
npm run ci           # build shared + web + extension, then API pytest (needs Python deps in apps/api)
npm run dev:web      # dashboard dev server
npm run build:web
npm run build:extension   # output: easyjob/apps/extension/dist
```

## License

MIT (adjust as needed for your org).

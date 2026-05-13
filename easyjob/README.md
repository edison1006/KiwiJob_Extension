# EasyJob (MVP)

EasyJob is a **Chrome Extension** + **React dashboard** + **FastAPI API** for saving job postings, tracking application status, uploading a CV (PDF/DOCX), and running an **AI JD ↔ CV match** analysis.

Monorepo layout:

- `apps/web` — Vite + React + TypeScript + Tailwind dashboard
- `apps/extension` — Manifest V3 Chrome extension (content script + service worker + popup)
- `apps/api` — FastAPI + SQLModel + PostgreSQL API
- `packages/shared` — Shared TypeScript contracts (`JobSavePayload`, statuses, DTO shapes)

## Prerequisites

- Node.js 20+ (recommended)
- Python **3.10+** recommended (Docker image uses **3.12**). The API pins `eval-type-backport` so **3.9** can still parse modern union annotations in many environments.
- Docker Desktop (optional, for `docker-compose`)

## Quick start (local)

### 1) Database

```bash
docker run --name easyjob-pg -e POSTGRES_USER=easyjob -e POSTGRES_PASSWORD=easyjob -e POSTGRES_DB=easyjob -p 5432:5432 -d postgres:16-alpine
```

### 2) API

```bash
cd easyjob/apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ../../.env.example .env
# edit .env: DATABASE_URL, OPENAI_API_KEY (optional)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
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

Open `http://localhost:5173`.

### 4) Chrome extension

```bash
cd easyjob
npm run build -w @easyjob/extension
```

Then in Chrome: **Extensions → Load unpacked →** select `easyjob/apps/extension/dist`.

Notes:

- Set **API base URL** in the popup (defaults to `http://localhost:8000`).
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
- `POST /match/analyze` — body `{ "job_id": <applicationId> }` (requires CV text)
- `GET /match/{job_id}` — latest stored match JSON
- `GET /analytics/summary`

If `OPENAI_API_KEY` is missing, match analysis uses a small deterministic **mock scorer** so the UI still works.

## Architecture notes (future hooks)

- `EmailEvent` and `Notification` tables exist as **stubs** for later Gmail ingestion + in-app alerts.
- Extension `siteExtractors` registry is ready for SEEK / LinkedIn / Indeed / Trade Me / career-site parsers without changing the pipeline.

## Scripts

- `npm run dev:web` — dashboard dev server
- `npm run build:web` — dashboard production build
- `npm run build:extension` — extension build output in `apps/extension/dist`

## License

MIT (adjust as needed for your org).

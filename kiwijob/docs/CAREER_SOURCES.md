# Career source ingestion

KiwiJob can synchronize public New Zealand jobs from company-managed Greenhouse, Lever, and SmartRecruiters career sites. The ingestion service uses public posting endpoints, filters results to New Zealand, records content hashes, backs off failed sources, and only closes a job after it is missing from two successful snapshots.

## Add a source

Run commands from `apps/api` with the production `DATABASE_URL` configured:

```bash
python scripts/career_sources.py add \
  --company "Example Company" \
  --type greenhouse \
  --tenant examplecompany \
  --url https://boards.greenhouse.io/examplecompany \
  --domain https://example.co.nz \
  --country NZ \
  --interval 60
```

Supported `--type` values are `greenhouse`, `lever`, and `smartrecruiters`. The tenant is the public board identifier in the ATS career-site URL.

For a reviewed registry, import a JSON array in one transaction:

```json
[
  {
    "company": "Example Company",
    "type": "greenhouse",
    "tenant": "examplecompany",
    "url": "https://boards.greenhouse.io/examplecompany",
    "domain": "https://example.co.nz",
    "country": "NZ",
    "interval": 60
  }
]
```

```bash
python scripts/career_sources.py load --file reviewed-nz-career-sources.json
```

List sources and their health:

```bash
python scripts/career_sources.py list
```

## Run synchronization

```bash
python scripts/career_sources.py sync --limit 100 --concurrency 10
```

Configure the deployment platform to invoke that command every minute. Each invocation claims the next due sources by `next_poll_at`; the initial deployment can use a small limit and increase it as the source registry grows. `--force` is intended for controlled maintenance only.

Alternatively, enable the API's built-in loop with:

```dotenv
CAREER_SYNC_ENABLED=true
CAREER_SYNC_INTERVAL_SECONDS=60
CAREER_SYNC_BATCH_SIZE=100
CAREER_SYNC_CONCURRENCY=10
```

Database-backed leases prevent multiple API instances from intentionally processing the same due source. For a registry approaching 50,000 active companies, increase the batch size toward 833 per minute and scale API/worker capacity only after measuring ATS response times and failure rates.

The regular authenticated `POST /jobs/search` endpoint automatically merges active aggregated jobs with the existing live job-board results and removes duplicate canonical URLs.

## Operating rules

- Register only public career pages and approved feeds.
- Do not add sources that require login or bypass access controls.
- Keep per-run concurrency conservative and monitor `failure_count` and `last_error`.
- A source is delayed exponentially after failures, up to 24 hours.
- Missing jobs remain active until two successful source snapshots omit them.

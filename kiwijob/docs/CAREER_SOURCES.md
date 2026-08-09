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

## Discover sources from company websites

Use a reviewed JSON list of New Zealand employers and their public websites. The discovery command follows only a small number of public company pages, respects `robots.txt`, detects supported public ATS links, and saves discoveries into the source registry:

```bash
python scripts/career_sources.py discover \
  --file ../../docs/company-seeds.example.json \
  --concurrency 10 \
  --max-pages 4
```

Preview without changing the database:

```bash
python scripts/career_sources.py discover \
  --file reviewed-nz-companies.json \
  --dry-run
```

JSON and CSV seed files are supported. Each seed must contain `company` (or `name`) and `website` (or `domain`). For official bulk exports with different headers, pass `--company-column` and `--website-column`. Large files are processed in bounded batches without loading the entire CSV into memory:

```bash
python scripts/career_sources.py discover \
  --file nzbn-businesses.csv \
  --company-column ENTITY_NAME \
  --website-column WEBSITE \
  --offset 0 \
  --limit 1000 \
  --concurrency 10
```

Increase `--offset` by the batch size in subsequent runs. The official NZBN/Companies Office bulk data service requires approved access, and many registered entities do not publish a website or operate a public careers page. Run discovery daily or when the reviewed company list changes; run job synchronization separately every minute.

Discovery recognizes public Greenhouse, Lever, and SmartRecruiters company boards. It also detects company-owned career sites that publish standard `schema.org/JobPosting` data, including job detail URLs exposed through public sitemaps. Unsupported sites without a documented feed or structured public job data are not scraped generically because public visibility alone does not imply permission for automated bulk access.

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

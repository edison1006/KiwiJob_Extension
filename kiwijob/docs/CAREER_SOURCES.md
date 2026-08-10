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

The monthly Companies Office ZIP can also be used directly, without extracting its roughly 850 MB of CSV data. KiwiJob joins `companies_core_data.csv` and `companies_website.csv` by NZBN, keeps only companies whose status is `Registered`, ignores placeholder website values, and checks every distinct public website recorded for each selected company:

```bash
python scripts/career_sources.py discover \
  --file "../../../Companies Office Bulk Data August 2026.zip" \
  --offset 0 \
  --limit 1000 \
  --concurrency 10
```

The offset and limit apply to companies rather than website rows. Increase `--offset` by the batch size until the command reports no more eligible companies. A company can produce more than one website check when the register contains multiple distinct public websites for its NZBN.

The official NZBN/Companies Office bulk data service requires approved access, and many registered entities do not publish a website or operate a public careers page. Run discovery after each monthly bulk-data release; run job synchronization separately every minute.

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

Live SEEK searches read up to five result pages (100 listings) instead of stopping at the first page. Public live-search results are cached by keyword, classification, location, work type, salary, and source selection for five minutes so moving between KiwiJob result pages does not repeatedly request the same public pages. An explicit **Find jobs** request bypasses that cache.

The Jobs page loads default recommendations once when the signed-in user opens it. Editing keywords, classification, location, work type, or salary does not issue requests. When the user explicitly selects **Find jobs**, the web app sends `refresh_sources: true`; the API then refreshes a bounded batch of due career sources before returning results. Sources with existing jobs that match the current filters are moved to the front of that batch. This keeps interactive refreshes bounded while the background loop continues to cover the full registry.

The classification filter uses the standard broad job families shown by major New Zealand job boards. SEEK cards retain their published classification; structured company postings use `occupationalCategory` or `industry` when available, with title and description matching as a fallback for indexed company jobs.

When no keyword is supplied, results are ranked using the signed-in user's saved skills, professional summary, preferred city, and recent tracked roles. Posting date is the secondary sort key, so equally relevant jobs show newest first. With a keyword, explicit keyword relevance takes priority and posting date breaks ties.

The Jobs page displays 20 ranked results per page. The API returns the filtered result total in `X-Total-Count`, while applying `result_offset` and `result_limit` only after ranking and deduplication so ordering remains stable across pages. The web app uses that total for the displayed range and next-page availability.

## Operating rules

- Register only public career pages and approved feeds.
- Do not add sources that require login or bypass access controls.
- Keep per-run concurrency conservative and monitor `failure_count` and `last_error`.
- A source is delayed exponentially after failures, up to 24 hours.
- Missing jobs remain active until two successful source snapshots omit them.

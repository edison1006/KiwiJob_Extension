# KiwiJob production operations

## Before deployment

1. Confirm CI passes for the exact commit being released.
2. Take or verify a recoverable PostgreSQL snapshot.
3. Confirm `ENVIRONMENT=production`, a unique `JWT_SECRET_KEY`, `SECURE_AUTH_COOKIE=true`, TLS in `DATABASE_URL`, `OPENAI_API_KEY`, `RESUME_S3_BUCKET`, `RATE_LIMIT_ENABLED=true`, and explicit Web/Chrome extension CORS origins.
4. Review the Alembic migration and run `python -m alembic upgrade head` before starting the new API build.
5. Build the web app with production Vite values and create the extension artifact with `npm run package:extension`.

## Smoke checks

- `GET /health` returns 200 for process liveness.
- `GET /ready` returns 200 and reports the database as `ok`.
- The Web app loads directly at `/login`, `/privacy`, and `/terms` without console errors.
- A release test account can register, upload a non-sensitive sample CV, save a job, run one match, and delete its account.
- The packaged extension loads without Manifest errors and works on at least SEEK and one additional supported source.

Remove the release test account and its sample data after verification.

## Rollback

1. Stop traffic promotion if readiness or smoke checks fail.
2. Restore the previous API application version and Web build.
3. Do not automatically downgrade Alembic. Current releases should keep schema changes backward compatible for one application version; otherwise restore the pre-deploy database snapshot under an incident procedure.
4. Invalidate only the affected CloudFront paths, then repeat health and smoke checks.

## Monitoring and alerts

At minimum, alert on API 5xx rate, `/ready` failures, Elastic Beanstalk unhealthy instances, PostgreSQL storage/connections, S3 access errors, AI provider failures, and unusual 429 volume. Keep logs free of authorization headers, tokens, CV text, and job-description bodies.

CloudFront access logging, a Web ACL/WAF policy, centralized application error tracking, and tested database-backup retention must be configured in AWS before broad public launch.

The checked-in CloudFront templates attach AWS's managed `SecurityHeadersPolicy`. Confirm the deployed distributions still reference that policy after every infrastructure update.

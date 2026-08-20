# KiwiJob production operations

## Before deployment

1. Confirm CI passes for the exact commit being released.
2. Take or verify a recoverable PostgreSQL snapshot.
3. Confirm `ENVIRONMENT=production`, a unique `JWT_SECRET_KEY`, `SECURE_AUTH_COOKIE=true`, TLS in `DATABASE_URL`, `OPENAI_API_KEY`, `RESUME_S3_BUCKET`, `RATE_LIMIT_ENABLED=true`, all four `STRIPE_*` values, and explicit Web/Chrome extension CORS origins.
4. Set the AI cost guardrails. Free users receive 20 AI calls/month, Pro 500, and Premium 1,500, with additional hourly/daily abuse limits. `AI_MONTHLY_BUDGET_CENTS=9500` conservatively reserves no more than $95/month in-app, leaving a $5 buffer below the $100 target. Match reserves 2 cents, full-CV optimization 3 cents, and Copilot 4 cents per provider call based on worst-case UTF-8 input size and configured output caps. Batched autofill counts once per generated field. Per-call output caps default to 2,000 tokens for matching, 5,000 for full-CV optimization, and 1,500 for Copilot/cover letters. Recalculate these reservations before changing `OPENAI_MODEL` from `gpt-4o-mini`.
5. Review the Alembic migration and run `python -m alembic upgrade head` before starting the new API build.
6. Build the web app with production Vite values and create the extension artifact with `npm run package:extension`.

## Membership administration

Create monthly recurring Prices in Stripe for Pro and Premium, then set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, and `STRIPE_PREMIUM_PRICE_ID`. Register this event destination:

`https://api.kiwijob.co.nz/billing/webhook`

Subscribe it to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Enable plan switching, cancellation, invoice history, and payment-method updates in the Stripe Customer Portal settings. Membership changes are provisioned only by signed webhook events.

For an exceptional manual recovery after separately confirming payment, use:

`python scripts/set_membership.py --email member@example.com --tier pro --days 31`

Use `--tier free` to revoke an entitlement. Never grant membership from a browser-only flag, Checkout success redirect, or an unsigned webhook.

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

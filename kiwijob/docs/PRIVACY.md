# KiwiJob — Privacy policy (extension & companion services)

**Last updated:** 2026-05-14

KiwiJob is an open-source job application tracker. It includes a **Chrome extension** (side panel) and optional **self-hosted** web app and API. This document describes what data can be processed and how you control it.

## Who is responsible

If you install the extension and connect it to **your own** KiwiJob API, **you** (or the organization running that API) are the data controller for data stored on that server.

If you use someone else’s deployment, that operator’s terms apply in addition to this description.

## What the extension can access

- **Active tab / job pages:** The extension reads the **URL and visible page content** of the tab you use it on, so it can extract job title, company, and description. It does not read unrelated tabs in the background for tracking purposes.
- **Storage (`chrome.storage`):** Settings such as your **API base URL** and **mock user id** are stored locally in the browser.
- **Network:** The extension sends extracted job data and requests (for example save job, match analysis) **only to the API base URL you configure**. It does not send that data to the extension authors by default.

## What the API may process (when you use it)

Depending on how you use KiwiJob, the self-hosted API may process:

- **Job postings:** URL, title, company, job description text, and application status you set.
- **Resumes / CVs:** Files or text you upload for parsing and match scoring.
- **Match results:** Outputs from analysis (which may use a configured AI provider on the **server**, not inside the extension).

The extension **does not** embed your OpenAI key; server operators configure keys on the API if they enable AI features.

## Cookies and advertising

KiwiJob does not use the extension to inject third-party advertising or cross-site tracking cookies. Any cookies would come only from **your** API or web app host, under that deployment’s policy.

## Data retention and deletion

Retention is determined by the **API/database** you connect to. Use your deployment’s tools (or database access) to delete jobs, applications, or resumes as needed.

## Children

KiwiJob is not directed at children under 13, and we do not knowingly collect personal information from children.

## Changes

This policy may be updated in the repository. For Chrome Web Store listings, point your **privacy policy URL** at the published version of this file (for example the `raw.githubusercontent.com` link to this document on your default branch).

## Contact

For the open-source project, open an issue on the **KiwiJob** GitHub repository you obtained this code from.

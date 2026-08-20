# Chrome Web Store submission — KiwiJob 0.4.0

Use this as the source of truth for the Developer Dashboard. Keep the listing,
Privacy practices answers, test instructions, and packaged behavior consistent.

## Item

- Extension ID: `medjbbmnbpeijhapfldniaehipbllohd`
- Package: `releases/kiwijob-extension-0.4.0.zip`
- Privacy policy: `https://app.kiwijob.co.nz/privacy`
- Terms: `https://app.kiwijob.co.nz/terms`
- Support: `https://github.com/edison1006/KiwiJob_Extension/issues`

## Store listing

**Name:** KiwiJob — Job save & CV match

**Short description:** Save job postings, track applications, and run user-requested CV match analysis from supported job sites.

**Single purpose:** KiwiJob helps job seekers capture the job posting in the active supported tab, save it to their KiwiJob application tracker, and request a match analysis against a CV they selected in their KiwiJob account.

**Detailed description:**

KiwiJob keeps job discovery and application tracking connected. Open KiwiJob on a supported job posting to review the detected title, company, location, salary, and description. Choose Save to add the posting to your private KiwiJob tracker, or choose Run match to request a CV-to-job analysis.

Nothing is saved automatically. Job data is sent to the configured KiwiJob API only after the user chooses Save or Run match. KiwiJob does not automatically apply for jobs, inject advertising, sell user data, or track unrelated browsing.

Features include:

- Review detected job details before saving.
- Save jobs and application status to the KiwiJob dashboard.
- Run a user-requested CV match and review skills, experience, keyword, and risk feedback.
- Open the tracker, CV, and analytics pages from the extension.

AI-generated results may be incomplete or incorrect and should be reviewed by the user.

## Permission justifications

- `storage`: Stores the configured KiwiJob API and dashboard addresses, authentication state, first-use disclosure consent, selected CV identifier, and most recently saved application identifier.
- `activeTab`: Lets the extension work with the supported job tab the user is actively viewing after the user opens or invokes KiwiJob.
- `tabs`: Keeps the panel synchronized with the active supported job tab, sends an extraction request to that tab, and opens dashboard pages after an explicit user action.
- `sidePanel`: Displays KiwiJob in Chrome's side panel.
- Job-site host access: Loads the fixed content script on the job-board and applicant-tracking-system allowlist in `manifest.json` so KiwiJob can detect a posting when the user opens the panel. It does not fetch or execute remote code.
- KiwiJob API host access: Sends authentication, Save, Match, and account requests to `https://api.kiwijob.co.nz` over HTTPS.

## Privacy practices answers

Declare the following categories because the extension handles them:

- Personally identifiable information: account email, display name, and account identifier.
- Authentication information: KiwiJob authentication state stored in Chrome storage.
- Website content: job title, company, location, salary, description, and other visible posting fields on a supported active job page.
- Web history / browsing activity: the URL and hostname of the supported job posting used for the requested feature.
- User-generated content: saved notes, application status, CV/profile fields, and match requests associated with the user's KiwiJob account.

Purposes: account authentication; job detection; user-requested saving and tracking; user-requested CV match analysis; security; reliability; and troubleshooting. Certify Limited Use only after verifying these answers still match the package and privacy policy.

## Reviewer test instructions

Before submission, replace the placeholders below with a dedicated non-personal reviewer account. Do not use a personal account or include real CV data.

- Test email: `<reviewer-test-email>`
- Test password: `<reviewer-test-password>`
- Test CV: a synthetic CV already uploaded to the reviewer account

Steps:

1. Install the extension and open a supported public job posting.
2. Open KiwiJob from the toolbar or Chrome side panel.
3. Read the first-use disclosure and choose **Agree and continue**.
4. Sign in with the reviewer account.
5. Confirm the detected job details, then choose **Save to job tracker**.
6. Choose **Run match now** and verify that a result appears.
7. Open the dashboard and confirm that the saved job appears in the tracker.
8. Use **Privacy** in the extension footer to open the published privacy notice.

## Assets and release controls

- Upload at least one real 1280×800 product screenshot; 3–5 are preferred. Do not use generated or reconstructed product screenshots.
- Use the packaged 128×128 icon.
- Start with **Private / trusted testers** and install that store build for final testing with the official extension ID.
- Use deferred publishing when submitting for review so approval does not automatically make the item public.

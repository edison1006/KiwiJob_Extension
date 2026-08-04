# KiwiJob privacy notice

**Last updated:** 4 August 2026

This notice covers the hosted service at `app.kiwijob.co.nz`, its API, and the official KiwiJob Chrome extension. KiwiJob is also open source. If you configure the extension to use another API, that deployment's operator is responsible for the information stored there and its privacy terms also apply.

## Information KiwiJob processes

Depending on how you use the service, KiwiJob may process:

- Account email, display name, authentication identifiers, and encrypted password credentials.
- CV files, extracted CV text, profile fields, skills, links, work preferences, and application answers.
- Job URLs, posting content, companies, notes, application status, timeline events, and match results.
- Technical service information such as request time, IP address, browser information, and error details.
- Extension settings stored in Chrome, including API and web addresses, authentication state, and selected CV id.

## Purposes

KiwiJob uses this information to authenticate you, provide and synchronize the dashboard and extension, store your job-search history, generate features you request, calculate application insights, prevent abuse, troubleshoot errors, and secure the service. KiwiJob does not sell personal information or use the extension to inject advertising or track unrelated browsing.

## Browser extension access

The extension runs on the job-site allowlist declared in its manifest. It reads a supported active job page when you open the panel or request a refresh. It sends job information to your configured KiwiJob API only when you choose **Save** or **Run match now**. It does not read email pages, monitor unrelated browsing, or automatically submit job applications.

## AI, hosting, and other providers

- **Amazon Web Services** provides application, database, file-storage, and delivery infrastructure for the hosted service.
- **OpenAI** may receive the relevant job description, CV text, profile fields, and instructions when you request an AI feature. The OpenAI key is configured on the server and is not included in the extension.
- **Google or Apple** receives sign-in information only when its sign-in option is configured and you choose it.

These providers may process information outside New Zealand under their own privacy and security terms.

## Retention and deletion

Account data remains available while the account is active. Users can delete individual jobs and CVs or delete an account from **Settings**. Account deletion removes associated primary database records and stored CV files. Disaster-recovery backups, when enabled, are isolated from normal use and expire under the hosting configuration rather than being used to recreate a deleted account.

Users may contact the project support channel to request access, correction, or deletion assistance.

## Security and children

KiwiJob uses account access controls, HTTPS for the public service, private file storage, and account-scoped records. No system can guarantee absolute security. KiwiJob is not directed to children under 13.

## Contact and changes

For privacy questions, use the public support channel linked from the KiwiJob web app or the GitHub repository's issue tracker. Do not include CV contents, passwords, tokens, or other sensitive personal information in a public issue.

Material changes will be reflected by the updated date in this notice.

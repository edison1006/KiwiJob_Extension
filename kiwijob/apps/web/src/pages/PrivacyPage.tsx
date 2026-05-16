export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Privacy policy</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">KiwiJob data storage and deletion</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Last updated: 17 May 2026</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">What we store</h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          KiwiJob stores your account email, display name, uploaded resumes, extracted resume text, application profile fields,
          saved jobs, application statuses, match results, and activity events used for insights.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">How the data is used</h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          Data is used to show your dashboard, keep the Chrome extension and web app in sync, generate job match analysis,
          support autofill and cover-letter features, and calculate application insights. Each record is tied to your logged-in user id.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Browser extension access</h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          The extension runs only on the configured job-site allowlist and sends detected job information to your KiwiJob API when you save,
          match, autofill, or track activity. It does not request cookie permission.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Deleting your data</h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          You can delete your account from Settings. Deletion removes your account, resumes, stored resume files, saved applications,
          match results, events, notifications, and email-event records from the KiwiJob database. If backups are enabled in production,
          backup copies should expire under the host provider retention schedule.
        </p>
      </section>
    </article>
  );
}

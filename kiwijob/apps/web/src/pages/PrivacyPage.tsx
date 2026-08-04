import { Link } from "react-router";

const sectionClass = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";

export default function PrivacyPage() {
  const supportUrl = import.meta.env.VITE_SUPPORT_URL?.trim() || import.meta.env.VITE_ISSUES_URL?.trim();

  return (
    <article className="mx-auto max-w-3xl space-y-8 py-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Privacy notice</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">How KiwiJob handles your data</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Last updated: 4 August 2026</p>
      </div>

      <section className={sectionClass}>
        <h2 className="text-lg font-bold text-slate-950">Who is responsible</h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          The operator of the KiwiJob deployment you use is responsible for the personal information stored by that deployment.
          This notice describes the hosted service at app.kiwijob.co.nz and the official KiwiJob browser extension. If you connect
          the open-source extension to another API, that API operator&apos;s privacy terms also apply.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-bold text-slate-950">Information we process</h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          KiwiJob processes your account email and display name; uploaded CV files and extracted text; application profile fields;
          saved job URLs, descriptions, notes, and statuses; AI match and writing results; and activity events used for application
          insights. Technical service logs may include request time, IP address, browser information, and error details.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-bold text-slate-950">How information is used</h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          We use the information to authenticate you, provide and synchronize the dashboard and extension, store your application
          history, generate features you request, prevent abuse, troubleshoot errors, and protect the service. We do not sell your
          personal information or use the extension to inject advertising or track unrelated browsing.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-bold text-slate-950">AI, hosting, and other providers</h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          The hosted service uses Amazon Web Services for application, database, and file infrastructure. When you request an AI
          feature, the relevant job description, CV text, profile fields, and instructions may be sent to the configured OpenAI
          service to generate the result. Google or Apple receives sign-in information only when its sign-in option is configured
          and you choose it. These providers may process information outside New Zealand under their own privacy and security terms.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-bold text-slate-950">Browser extension access</h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          The extension runs on the job-site allowlist in its manifest. It reads a supported active job page when you open the panel
          or request a refresh. It sends job information to your configured KiwiJob API only when you choose Save or Run match now.
          Authentication state, API and web addresses, and your selected CV id may be stored in Chrome storage.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-bold text-slate-950">Retention, deletion, and your choices</h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          Account data remains available while your account is active. You can delete individual jobs and CVs or delete your account
          from Settings. Account deletion removes the associated primary database records and stored CV files. Disaster-recovery
          backups, when enabled, are isolated from normal use and expire under the hosting configuration rather than being used to
          recreate a deleted account. You may contact support to ask for access, correction, or deletion assistance.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-bold text-slate-950">Security, children, and contact</h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          KiwiJob uses account access controls, HTTPS for the public service, private file storage, and account-scoped records. No system
          can guarantee absolute security. KiwiJob is not directed to children under 13. Privacy questions can be raised through the{" "}
          {supportUrl ? <a className="font-semibold text-brand-700 hover:underline" href={supportUrl}>support channel</a> : "project support channel"}.
          Changes to this notice will be shown by the updated date above.
        </p>
      </section>

      <p className="text-sm text-slate-600">
        Also read the <Link className="font-semibold text-brand-700 hover:underline" to="/terms">Terms of Use</Link>.
      </p>
    </article>
  );
}

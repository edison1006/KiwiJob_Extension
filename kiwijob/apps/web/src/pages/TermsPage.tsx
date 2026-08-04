import { Link } from "react-router-dom";

const sectionClass = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";

export default function TermsPage() {
  const issuesUrl = import.meta.env.VITE_SUPPORT_URL?.trim() || import.meta.env.VITE_ISSUES_URL?.trim();

  return (
    <article className="mx-auto max-w-3xl space-y-8 py-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Terms of use</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Using KiwiJob</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Last updated: 4 August 2026</p>
      </div>

      <section className={sectionClass}>
        <h2 className="text-lg font-bold text-slate-950">The service</h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          KiwiJob helps you save job listings, organize applications, store CVs, and generate AI-assisted application material.
          Features may change during the beta period, and availability is not guaranteed.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-bold text-slate-950">Your account and content</h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          Keep your account credentials secure and provide accurate registration information. You retain ownership of the CVs,
          profile information, notes, and other content you submit. You give KiwiJob permission to process that content only as
          needed to provide, secure, and improve the service.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-bold text-slate-950">Acceptable use</h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          Do not misuse the service, attempt unauthorized access, upload malicious files, interfere with other users, scrape the
          service at scale, or use KiwiJob to violate a job site&apos;s rules or applicable law. You must be at least 13 years old.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-bold text-slate-950">AI and third-party services</h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          AI-generated scores, suggestions, cover letters, and interview material may be incomplete or incorrect. Review them
          before use; KiwiJob does not guarantee employment outcomes or provide legal, immigration, or career advice. Job boards,
          identity providers, payment providers, and linked websites are independent third-party services with their own terms.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-bold text-slate-950">Suspension, deletion, and availability</h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          You may delete your account from Settings. KiwiJob may restrict accounts that create security, legal, or abuse risks.
          The service is provided on an “as available” basis during beta, without a promise that every feature will always be
          uninterrupted or error-free.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-bold text-slate-950">Contact and changes</h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          Material changes will be reflected by the date on this page. For questions, use the{" "}
          {issuesUrl ? <a className="font-semibold text-brand-700 hover:underline" href={issuesUrl}>support channel</a> : "project support channel"}.
          See the <Link className="font-semibold text-brand-700 hover:underline" to="/privacy">Privacy Notice</Link> for data handling details.
        </p>
      </section>
    </article>
  );
}

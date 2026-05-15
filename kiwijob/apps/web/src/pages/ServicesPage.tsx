import { Link } from "react-router-dom";

const stroke = { stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

type CoverLetterCard = {
  title: string;
  description: string;
  action: string;
  icon: "write" | "ai" | "template";
};

const cards: CoverLetterCard[] = [
  {
    title: "Write",
    description: "Start from a blank cover letter and edit it in your own words.",
    action: "Start writing",
    icon: "write",
  },
  {
    title: "AI Generate",
    description: "Generate a tailored draft from your CV, saved job, and profile details.",
    action: "Generate with AI",
    icon: "ai",
  },
  {
    title: "Template",
    description: "Choose a reusable structure and customize it for each application.",
    action: "Browse templates",
    icon: "template",
  },
];

function CardIcon({ icon }: { icon: CoverLetterCard["icon"] }) {
  if (icon === "ai") {
    return (
      <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden>
        <path {...stroke} d="M12 3l1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3z" />
        <path {...stroke} d="M19 14l.7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14z" />
        <path {...stroke} d="M5 13l.6 1.9L7.5 15.5l-1.9.6L5 18l-.6-1.9-1.9-.6 1.9-.6L5 13z" />
      </svg>
    );
  }

  if (icon === "template") {
    return (
      <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden>
        <rect {...stroke} x="4" y="3" width="16" height="18" rx="2" />
        <path {...stroke} d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    );
  }

  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden>
      <path {...stroke} d="M12 20h9" />
      <path {...stroke} d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function CoverLetterOptionCard({ title, description, action, icon }: CoverLetterCard) {
  return (
    <article className="flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
        <CardIcon icon={icon} />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{description}</p>
      <button
        type="button"
        className="mt-5 inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
      >
        {action}
      </button>
    </article>
  );
}

export default function ServicesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Cover Letter</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Generate and refine role-specific cover letters from your saved job, CV, and application profile. Core profile data lives under{" "}
          <Link className="font-medium text-brand-700 hover:underline" to="/documents">
            Documents
          </Link>{" "}
          and{" "}
          <Link className="font-medium text-brand-700 hover:underline" to="/tracker">
            Job tracker
          </Link>
          .
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <CoverLetterOptionCard key={card.title} {...card} />
        ))}
      </div>
    </div>
  );
}

const stroke = { stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

type InterviewCard = {
  title: string;
  description: string;
  action: string;
  icon: "behavioral" | "technical" | "panel" | "case";
};

const cards: InterviewCard[] = [
  {
    title: "Behavioral Interview",
    description: "Practice STAR answers for teamwork, conflict, leadership, and motivation questions.",
    action: "Practice behavioral",
    icon: "behavioral",
  },
  {
    title: "Technical Interview",
    description: "Prepare role-specific technical questions and explain your problem-solving process.",
    action: "Practice technical",
    icon: "technical",
  },
  {
    title: "Panel Interview",
    description: "Rehearse structured answers for multiple interviewers and cross-functional discussions.",
    action: "Prepare panel",
    icon: "panel",
  },
  {
    title: "Case Study / Take-home Assignment",
    description: "Plan case studies, take-home tasks, presentation outlines, and follow-up notes.",
    action: "Start case prep",
    icon: "case",
  },
];

function CardIcon({ icon }: { icon: InterviewCard["icon"] }) {
  if (icon === "technical") {
    return (
      <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden>
        <path {...stroke} d="M8 9l-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" />
      </svg>
    );
  }

  if (icon === "panel") {
    return (
      <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden>
        <circle {...stroke} cx="7" cy="8" r="3" />
        <circle {...stroke} cx="17" cy="8" r="3" />
        <path {...stroke} d="M2.5 19a4.5 4.5 0 019 0M12.5 19a4.5 4.5 0 019 0" />
      </svg>
    );
  }

  if (icon === "case") {
    return (
      <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden>
        <path {...stroke} d="M10 6h4M4 7a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7z" />
        <path {...stroke} d="M8 13h8M8 17h5" />
      </svg>
    );
  }

  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden>
      <path {...stroke} d="M12 20a8 8 0 100-16 8 8 0 000 16z" />
      <path {...stroke} d="M8.5 12.5l2.2 2.2 4.8-5.2" />
    </svg>
  );
}

function InterviewOptionCard({ title, description, action, icon }: InterviewCard) {
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

export default function InterviewAssistantPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Interview Assistant</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Prepare for different interview formats with guided practice, structured answer planning, and role-specific prompts.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <InterviewOptionCard key={card.title} {...card} />
        ))}
      </div>
    </div>
  );
}

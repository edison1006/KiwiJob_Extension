const plans = [
  {
    title: "Free",
    price: "$0",
    description: "Basic job tracking and saved roles.",
    features: ["Save jobs", "Track application status", "View basic match results"],
  },
  {
    title: "Pro",
    price: "$9 / month",
    description: "More AI help for applications and interviews.",
    features: ["Unlimited AI match refresh", "Cover letter generation", "Interview assistant practice"],
    checkoutUrl: import.meta.env.VITE_PRO_CHECKOUT_URL?.trim(),
  },
  {
    title: "Premium",
    price: "$19 / month",
    description: "Full job search support with deeper optimization.",
    features: ["Priority AI insights", "Advanced CV weak spot highlights", "Application trend analytics"],
    checkoutUrl: import.meta.env.VITE_PREMIUM_CHECKOUT_URL?.trim(),
  },
];

function openCheckout(url: string | undefined) {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function MembershipPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Premium</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Choose a KiwiJob plan for AI matching, cover letters, interview preparation, and application tracking.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <article key={plan.title} className="flex min-h-72 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{plan.title}</h2>
            <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{plan.price}</div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{plan.description}</p>
            <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-700">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            {plan.title === "Free" ? (
              <button
                type="button"
                className="mt-5 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm"
              >
                Current plan
              </button>
            ) : (
              <button
                type="button"
                disabled={!plan.checkoutUrl}
                onClick={() => openCheckout(plan.checkoutUrl)}
                className="mt-5 inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                title={plan.checkoutUrl ? `Upgrade to ${plan.title}` : `Set ${plan.title === "Pro" ? "VITE_PRO_CHECKOUT_URL" : "VITE_PREMIUM_CHECKOUT_URL"} to enable checkout`}
              >
                {plan.checkoutUrl ? "Upgrade" : "Checkout not configured"}
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

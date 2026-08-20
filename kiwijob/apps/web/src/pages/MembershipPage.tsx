import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth";
import {
  createBillingCheckout,
  createBillingPortal,
  fetchBillingStatus,
  type BillingStatus,
} from "../lib/api";

type Tier = "free" | "pro" | "premium";

const plans: Array<{
  tier: Tier;
  title: string;
  price: string;
  description: string;
  badge?: string;
  features: string[];
}> = [
  {
    tier: "free",
    title: "Free",
    price: "$0",
    description: "Everything you need to organise the first steps of your search.",
    features: ["20 AI actions each month", "Job tracker and saved roles", "CV and application workspace"],
  },
  {
    tier: "pro",
    title: "Pro",
    price: "$9.99",
    description: "More AI support for an active, focused job search.",
    badge: "Most popular",
    features: ["500 AI actions each month", "AI match analysis and CV optimisation", "Cover letters and interview practice"],
  },
  {
    tier: "premium",
    title: "Premium",
    price: "$19.99",
    description: "Our highest allowance for an intensive job-search campaign.",
    badge: "Maximum support",
    features: ["1,500 AI actions each month", "Highest hourly and daily allowances", "All current and future premium tools"],
  },
];

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="m5 10 3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

const billingStatusLabels: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Payment overdue",
  unpaid: "Payment failed",
  incomplete: "Payment incomplete",
  incomplete_expired: "Expired",
  paused: "Paused",
  canceled: "Cancelled",
  inactive: "Active",
};

const billingAttentionStatuses = new Set(["past_due", "unpaid", "incomplete", "paused"]);

export default function MembershipPage() {
  const { user, refresh: refreshUser } = useAuth();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyTier, setBusyTier] = useState<Tier | "manage" | null>(null);
  const [error, setError] = useState("");
  const checkoutResult = new URLSearchParams(window.location.search).get("checkout");

  async function refreshBilling() {
    const next = await fetchBillingStatus();
    setBilling(next);
    await refreshUser();
    return next;
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchBillingStatus()
      .then((next) => {
        if (active) setBilling(next);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (checkoutResult !== "success") return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      void refreshBilling().then((next) => {
        if (next.tier !== "free" || attempts >= 6) window.clearInterval(timer);
      }).catch(() => {
        if (attempts >= 6) window.clearInterval(timer);
      });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [checkoutResult]);

  const currentTier = billing?.tier ?? user?.membership_tier ?? "free";
  const usagePercent = useMemo(() => {
    if (!billing?.monthly_ai_limit) return 0;
    return Math.min(100, Math.round((billing.monthly_ai_used / billing.monthly_ai_limit) * 100));
  }, [billing]);

  async function choosePlan(tier: Tier) {
    setError("");
    setBusyTier(tier);
    try {
      const mustManageExistingSubscription = Boolean(billing?.has_subscription);
      const url = mustManageExistingSubscription || tier === "free" ? await createBillingPortal() : await createBillingCheckout(tier);
      window.location.assign(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open billing. Please try again.");
      setBusyTier(null);
    }
  }

  async function manageBilling() {
    setError("");
    setBusyTier("manage");
    try {
      window.location.assign(await createBillingPortal());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open billing. Please try again.");
      setBusyTier(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7 pb-10">
      <section className="relative overflow-hidden rounded-[30px] border border-white/80 bg-[#1a1036] px-6 py-8 text-white shadow-[0_28px_90px_-48px_rgba(77,43,140,.9)] sm:px-9 sm:py-10">
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-fuchsia-400/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-violet-400/30 blur-3xl" />
        <div className="relative max-w-3xl">
          <span className="inline-flex rounded-full border border-violet-300/25 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-violet-100">KiwiJob membership</span>
          <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">Put better tools behind every application.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-violet-100/75 sm:text-base">Get tailored matching, stronger CVs, faster cover letters and realistic interview practice—with one plan you can change or cancel at any time.</p>
        </div>
      </section>

      {checkoutResult === "success" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">Payment received. We’re confirming your membership now; this page will update automatically.</div>
      ) : checkoutResult === "cancelled" ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">Checkout was cancelled. Your current plan has not changed.</div>
      ) : null}

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900">{error}</div> : null}

      {billing && billingAttentionStatuses.has(billing.status) ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold">Your subscription needs attention.</p>
            <p className="mt-1 text-amber-800">Stripe could not confirm the latest payment. Update your payment method to keep paid features available.</p>
          </div>
          <button type="button" onClick={() => void manageBilling()} disabled={busyTier !== null} className="shrink-0 rounded-xl bg-amber-900 px-4 py-2.5 font-bold text-white transition hover:bg-amber-950 disabled:opacity-50">{busyTier === "manage" ? "Opening…" : "Fix payment"}</button>
        </div>
      ) : null}

      {billing ? (
        <section className="grid gap-4 rounded-[26px] border border-white/80 bg-white/80 p-5 shadow-[0_20px_60px_-48px_rgba(77,43,140,.75)] backdrop-blur sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-950">Your {plans.find((plan) => plan.tier === currentTier)?.title} plan</h2>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${billingAttentionStatuses.has(billing.status) ? "bg-amber-100 text-amber-800" : "bg-violet-100 text-violet-700"}`}>{billing.cancel_at_period_end ? "Cancelling" : billingStatusLabels[billing.status] ?? "Active"}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {billing.cancel_at_period_end && billing.renews_at
                ? `Access continues until ${formatDate(billing.renews_at)}.`
                : billing.renews_at
                  ? `Your next billing date is ${formatDate(billing.renews_at)}.`
                  : "No payment method is required."}
            </p>
            <div className="mt-4 max-w-xl">
              <div className="mb-1.5 flex justify-between text-xs font-semibold text-slate-600"><span>AI actions this month</span><span>{billing.monthly_ai_used.toLocaleString()} / {billing.monthly_ai_limit.toLocaleString()}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-violet-100"><div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-all" style={{ width: `${usagePercent}%` }} /></div>
            </div>
          </div>
          {billing.has_billing_account ? (
            <button type="button" onClick={() => void manageBilling()} disabled={busyTier !== null} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 shadow-sm transition hover:border-violet-300 hover:text-violet-700 disabled:opacity-50">{busyTier === "manage" ? "Opening…" : "Manage billing"}</button>
          ) : null}
        </section>
      ) : loading ? (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-6 text-sm text-slate-500">Loading membership…</div>
      ) : null}

      <section className="grid gap-5 md:grid-cols-3">
        {plans.map((plan) => {
          const current = plan.tier === currentTier;
          const highlighted = plan.tier === "pro";
          const disabled = loading || busyTier !== null || !billing?.configured || current;
          const action = current ? "Current plan" : currentTier === "free" && plan.tier !== "free" ? `Choose ${plan.title}` : "Change plan";
          return (
            <article key={plan.tier} className={`relative flex min-h-[390px] flex-col overflow-hidden rounded-[26px] border p-6 transition ${highlighted ? "border-violet-300 bg-[#1a1036] text-white shadow-[0_28px_75px_-42px_rgba(109,63,195,.95)]" : "border-white/80 bg-white/80 text-slate-950 shadow-[0_20px_58px_-50px_rgba(109,63,195,.72)] backdrop-blur"}`}>
              {plan.badge ? <span className={`mb-5 w-fit rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${highlighted ? "bg-fuchsia-400/20 text-fuchsia-100" : "bg-violet-100 text-violet-700"}`}>{plan.badge}</span> : <div className="mb-5 h-6" />}
              <h2 className="text-xl font-black">{plan.title}</h2>
              <div className="mt-3 flex items-end gap-1"><span className="text-4xl font-black tracking-tight">{plan.price}</span>{plan.tier !== "free" ? <span className={`pb-1 text-sm ${highlighted ? "text-violet-200/70" : "text-slate-500"}`}>NZD / month</span> : null}</div>
              <p className={`mt-3 min-h-12 text-sm leading-6 ${highlighted ? "text-violet-100/70" : "text-slate-600"}`}>{plan.description}</p>
              <ul className="mt-6 flex-1 space-y-3 text-sm">
                {plan.features.map((feature) => <li key={feature} className="flex gap-2.5"><span className={highlighted ? "text-fuchsia-300" : "text-violet-600"}><CheckIcon /></span><span className={highlighted ? "text-violet-50/90" : "text-slate-700"}>{feature}</span></li>)}
              </ul>
              <button type="button" disabled={disabled} onClick={() => void choosePlan(plan.tier)} className={`mt-7 rounded-xl px-4 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-55 ${highlighted ? "bg-white text-violet-900 hover:bg-violet-50" : "bg-violet-600 text-white hover:bg-violet-700"}`}>{busyTier === plan.tier ? "Opening…" : action}</button>
            </article>
          );
        })}
      </section>

      {billing && !billing.configured ? <p className="text-center text-xs text-slate-500">Secure checkout is being configured. Existing free features remain available.</p> : null}
      <p className="text-center text-xs leading-5 text-slate-500">Payments are securely processed by Stripe. Paid plans renew monthly until cancelled in the billing portal.</p>
    </div>
  );
}

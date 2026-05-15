import type { ApplicationStatus } from "@kiwijob/shared";

const STYLES: Record<ApplicationStatus, string> = {
  Saved: "bg-slate-100 text-slate-800 ring-slate-600/10",
  Applied: "bg-blue-50 text-blue-800 ring-blue-600/10",
  Viewed: "bg-indigo-50 text-indigo-800 ring-indigo-600/10",
  Assessment: "bg-amber-50 text-amber-900 ring-amber-600/10",
  Interview: "bg-emerald-50 text-emerald-800 ring-emerald-600/10",
  Rejected: "bg-rose-50 text-rose-800 ring-rose-600/10",
  Offer: "bg-green-50 text-green-800 ring-green-600/10",
  Withdrawn: "bg-zinc-100 text-zinc-700 ring-zinc-600/10",
};

export function StatusBadge({ status }: { status: ApplicationStatus | string }) {
  const cls = STYLES[status as ApplicationStatus] ?? "bg-slate-100 text-slate-800 ring-slate-600/10";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {status}
    </span>
  );
}

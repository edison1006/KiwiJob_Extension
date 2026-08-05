import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="relative flex flex-col gap-4 overflow-hidden rounded-[30px] border border-white/80 bg-white/72 p-5 shadow-[0_28px_90px_-62px_rgba(82,45,153,0.82)] backdrop-blur-xl sm:flex-row sm:items-start sm:justify-between sm:p-7">
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/70 to-transparent" />
      <div className="pointer-events-none absolute -right-14 -top-20 h-56 w-56 rounded-full bg-fuchsia-200/35 blur-3xl" />
      <div className="relative min-w-0">
        <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-brand-600">
          <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-500 shadow-[0_0_14px_rgba(217,70,239,0.9)]" />
          Live workspace
        </div>
        <h1 className="bg-gradient-to-r from-slate-950 via-brand-900 to-brand-600 bg-clip-text text-2xl font-extrabold tracking-[-0.035em] text-transparent sm:text-4xl">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-[15px]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="relative flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

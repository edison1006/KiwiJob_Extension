import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="flex flex-col gap-4 rounded-[28px] border border-white/75 bg-white/70 p-5 shadow-[0_22px_70px_-58px_rgba(109,63,195,0.72)] backdrop-blur sm:flex-row sm:items-start sm:justify-between sm:p-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

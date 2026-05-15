/** 20×20 outline icons for account dropdown (stroke matches sidebar). */

const stroke = {
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
};

export function IconMenuUser({ className = "h-5 w-5 shrink-0 text-slate-600" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path {...stroke} d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle {...stroke} cx="12" cy="7" r="4" />
    </svg>
  );
}

export function IconMenuFlag({ className = "h-5 w-5 shrink-0 text-slate-600" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path {...stroke} d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line {...stroke} x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

export function IconMenuSupport({ className = "h-5 w-5 shrink-0 text-slate-600" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <circle {...stroke} cx="12" cy="12" r="10" />
      <path {...stroke} d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" />
    </svg>
  );
}

export function IconMenuGear({ className = "h-5 w-5 shrink-0 text-slate-600" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <circle {...stroke} cx="12" cy="12" r="3" />
      <path {...stroke} d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

export function IconMenuSignOut({ className = "h-5 w-5 shrink-0 text-slate-600" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path {...stroke} d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline {...stroke} points="16 17 21 12 16 7" />
      <line {...stroke} x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

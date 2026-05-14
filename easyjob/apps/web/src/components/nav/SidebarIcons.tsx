/** 24×24 solid (filled) icons for left rail + toolbar — rounded, single-color silhouettes. */

const fill = { fill: "currentColor" };

export function IconHome({ className = "h-5 w-5 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path {...fill} d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5z" />
    </svg>
  );
}

export function IconHeart({ className = "h-5 w-5 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        {...fill}
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
      />
    </svg>
  );
}

export function IconBriefcase({ className = "h-5 w-5 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        {...fill}
        d="M10 2h4a2 2 0 012 2v2h5a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h5V4a2 2 0 012-2zm4 4V4h-4v2h4z"
      />
    </svg>
  );
}

export function IconJobTracker({ className = "h-5 w-5 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        {...fill}
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 4v7.09l4.55 2.73-.77 1.28L11 13.09V6h2z"
      />
    </svg>
  );
}

export function IconDocument({ className = "h-5 w-5 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path {...fill} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z" />
    </svg>
  );
}

export function IconServices({ className = "h-5 w-5 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <circle {...fill} cx="18" cy="5" r="3.25" />
      <circle {...fill} cx="6" cy="12" r="3.25" />
      <circle {...fill} cx="18" cy="19" r="3.25" />
      <path
        {...fill}
        d="M8.35 13.4l6.9 4 1.15-2-5.9-3.4 5.45-3.15-1.15-2-6.85 3.95z"
      />
    </svg>
  );
}

/** Soft disk + bold $ — works on white (idle) and blue pill (active). */
export function IconRefer({ className = "h-5 w-5 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2" />
      <text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="800" fill="currentColor">
        $
      </text>
    </svg>
  );
}

export function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 text-slate-400 opacity-70 ${className ?? ""}`.trim()}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M12 15.5a1.1 1.1 0 01-.8-.35l-5.2-5.5 1.6-1.5L12 12.2l4.4-4.7 1.6 1.5-5.2 5.5a1.1 1.1 0 01-.8.35z"
      />
    </svg>
  );
}

export function IconMegaphone({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        {...fill}
        d="M4 9v6h4l5 4V5L8 9H4zm13 1.5c0 1.2-.4 2.3-1 3.2V7.3c.6.9 1 2 1 3.2zM17 7v10a2 2 0 002-2V9a2 2 0 00-2-2z"
      />
    </svg>
  );
}

export function IconHelp({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        {...fill}
        fillRule="evenodd"
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 5.25a1.25 1.25 0 012.5 0c0 .55-.22 1-.55 1.35-.35.38-.95.9-.95 1.9V12h2v-.5c0-1.1.45-1.75.95-2.3.55-.6 1.05-1.25 1.05-2.45a3.25 3.25 0 00-6.5 0h2zm1.5 8a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function IconBell({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        {...fill}
        d="M12 22a2.5 2.5 0 002.45-2H9.55A2.5 2.5 0 0012 22zm8-5h-2.1a4 4 0 01-.4-.8l-.9-1.8V11a6 6 0 10-12 0v3.4l-.9 1.8a4 4 0 01-.4.8H4l2-2V11a8 8 0 1116 0v4l2 2z"
      />
    </svg>
  );
}

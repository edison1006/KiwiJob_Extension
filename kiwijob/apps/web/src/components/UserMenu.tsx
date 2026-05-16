import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { IconChevronDown } from "./nav/SidebarIcons";
import { IconMenuFlag, IconMenuGear, IconMenuSignOut, IconMenuSupport, IconMenuUser } from "./nav/AccountMenuIcons";

const LS_DISPLAY = "kiwijob_display_name";

export const KIWIJOB_PREFS_EVENT = "kiwijob-prefs";

export function readDisplayName(): string {
  return localStorage.getItem(LS_DISPLAY)?.trim() ?? "";
}

export function writeDisplayName(value: string) {
  const t = value.trim();
  if (t) localStorage.setItem(LS_DISPLAY, t);
  else localStorage.removeItem(LS_DISPLAY);
  window.dispatchEvent(new Event(KIWIJOB_PREFS_EVENT));
}

export function initialsFromPrefs(displayName: string): string {
  const n = displayName.trim();
  if (n.length >= 2) return n.slice(0, 2).toUpperCase();
  if (n.length === 1) return (n + n).toUpperCase();
  return "EJ";
}

const menuRow =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-800 transition hover:bg-slate-100";

const menuRowDisabled = "cursor-not-allowed opacity-45 hover:bg-transparent";

type Props = {
  displayName: string;
  onSignOut: () => void;
  /** `sidebar`: light styles for left rail. `header`: on gradient (legacy). */
  variant?: "sidebar" | "header";
  /** When `true` with `sidebar`, sits in the icon toolbar row (avatar only, menu right-aligned). */
  compactRow?: boolean;
};

export function UserMenu({ displayName, onSignOut, variant = "sidebar", compactRow = false }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let removeListener: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      const close = (e: MouseEvent) => {
        if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
      };
      document.addEventListener("mousedown", close);
      removeListener = () => document.removeEventListener("mousedown", close);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      removeListener?.();
    };
  }, [open]);

  const issuesUrl = import.meta.env.VITE_ISSUES_URL?.trim();
  const supportUrl = import.meta.env.VITE_SUPPORT_URL?.trim() || issuesUrl || "";

  const isHeader = variant === "header";
  const isSidebarCompact = variant === "sidebar" && compactRow;

  function closeMenu() {
    setOpen(false);
  }

  return (
    <div className={`relative z-10 ${isSidebarCompact ? "ml-auto shrink-0" : "min-w-0 w-full"}`} ref={root}>
      <button
        type="button"
        className={
          isHeader
            ? "flex w-full items-center gap-2 rounded-lg border border-white/30 bg-white/15 px-2.5 py-1.5 text-sm font-semibold text-white shadow-sm backdrop-blur hover:bg-white/25"
            : isSidebarCompact
              ? "flex min-w-0 items-center justify-center gap-1 rounded-lg px-1 py-2 text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30 lg:w-full"
              : "flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
        }
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={isSidebarCompact ? "Account menu" : undefined}
        title={isSidebarCompact ? "Account" : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span
          className={
            isHeader
              ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/90 text-xs font-bold text-brand-700"
              : isSidebarCompact
                ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white"
                : "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white"
          }
        >
          {initialsFromPrefs(displayName)}
        </span>
        {isSidebarCompact ? (
          <svg
            className={`h-3 w-3 shrink-0 text-slate-600 transition duration-200 ${open ? "translate-x-0.5" : ""}`.trim()}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              fill="currentColor"
              d="M9.3 5.3a1 1 0 011.4 0l6 6a1 1 0 010 1.4l-6 6-1.4-1.4 5.3-5.3-5.3-5.3a1 1 0 010-1.4z"
            />
          </svg>
        ) : null}
        {isSidebarCompact ? null : (
          <>
            <span className="min-w-0 flex-1 truncate text-left">Account</span>
            <span className={`shrink-0 text-[10px] ${isHeader ? "text-white/80" : "text-slate-500"}`}>{open ? "▲" : "▼"}</span>
          </>
        )}
      </button>

      {open ? (
        <div
          className={`absolute z-[100] w-[min(100%,18rem)] rounded-xl border border-slate-200 bg-white py-1.5 text-sm shadow-lg sm:w-56 ${
            isSidebarCompact
              ? "bottom-0 left-full ml-2 w-56"
              : isHeader
                ? "right-0 left-auto mt-1"
                : "left-0 mt-1"
          }`}
          role="menu"
        >
          <Link className={menuRow} to="/settings#profile" role="menuitem" onClick={closeMenu}>
            <IconMenuUser />
            Profile
          </Link>
          <Link className={menuRow} to="/settings#applicant-profile" role="menuitem" onClick={closeMenu}>
            <IconMenuUser />
            Application autofill
          </Link>

          {issuesUrl ? (
            <a
              className={menuRow}
              href={issuesUrl}
              target="_blank"
              rel="noreferrer"
              role="menuitem"
              onClick={closeMenu}
            >
              <IconMenuFlag />
              Report issue
            </a>
          ) : (
            <span className={`${menuRow} ${menuRowDisabled}`} title="Set VITE_ISSUES_URL in .env.local (e.g. GitHub Issues)." role="menuitem">
              <IconMenuFlag />
              Report issue
            </span>
          )}

          {supportUrl ? (
            <a className={menuRow} href={supportUrl} target="_blank" rel="noreferrer" role="menuitem" onClick={closeMenu}>
              <IconMenuSupport />
              Support
            </a>
          ) : (
            <span
              className={`${menuRow} ${menuRowDisabled}`}
              title="Set VITE_SUPPORT_URL or VITE_ISSUES_URL in .env.local."
              role="menuitem"
            >
              <IconMenuSupport />
              Support
            </span>
          )}

          <Link className={menuRow} to="/settings#preferences" role="menuitem" onClick={closeMenu}>
            <IconMenuGear />
            Settings
          </Link>

          <div className="mx-1 my-1 border-t border-slate-100" />

          <button
            type="button"
            className={`${menuRow} text-slate-800 hover:bg-rose-50 hover:text-rose-800`}
            role="menuitem"
            onClick={() => {
              closeMenu();
              onSignOut();
            }}
          >
            <IconMenuSignOut />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

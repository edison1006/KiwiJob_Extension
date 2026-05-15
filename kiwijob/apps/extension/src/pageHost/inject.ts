/** In-page launcher + drawer (Simplify-style). Styles stay in Shadow DOM. */

import { KIWIJOB_CLOSE_DRAWER, KIWIJOB_EXTENSION_SOURCE } from "./messages";

const HOST_ID = "kiwijob-chrome-page-host";

const SHADOW_CSS = `
:host { all: initial; }
.ej-root { font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
.ej-launcher {
  position: fixed;
  top: 38%;
  right: 0;
  z-index: 2147483646;
  transform: translateY(-50%);
  width: 44px;
  height: 112px;
  padding: 0;
  margin: 0;
  border: none;
  border-radius: 10px 0 0 10px;
  background: linear-gradient(180deg, #38bdf8 0%, #0ea5e9 100%);
  box-shadow: -2px 4px 16px rgba(15, 23, 42, 0.18);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: filter 0.15s ease, width 0.15s ease;
}
.ej-launcher:hover { filter: brightness(1.06); }
.ej-launcher:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.ej-launcher svg { width: 22px; height: 22px; flex-shrink: 0; }
.ej-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 2147483640;
  background: rgba(15, 23, 42, 0.18);
}
.ej-drawer-wrap.ej-open .ej-backdrop { display: block; }
.ej-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 2147483645;
  width: min(400px, 100vw);
  max-width: 100vw;
  background: #fff;
  box-shadow: -8px 0 32px rgba(15, 23, 42, 0.12);
  transform: translateX(100%);
  transition: transform 0.22s ease;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ej-drawer-wrap.ej-open .ej-drawer { transform: translateX(0); }
.ej-frame {
  border: none;
  width: 100%;
  height: 100%;
  flex: 1;
  display: block;
  background: #f8fafc;
}
`;

function logoSvg(): string {
  return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M8 4 L14 20 M11 4 L17 20" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
  </svg>`;
}

function ensureHost(): HTMLElement {
  let host = document.getElementById(HOST_ID) as HTMLElement | null;
  if (host) return host;
  host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute("data-kiwijob-host", "");
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = SHADOW_CSS;
  const root = document.createElement("div");
  root.className = "ej-root";

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "ej-launcher";
  launcher.title = "KiwiJob";
  launcher.setAttribute("aria-label", "Open KiwiJob");
  launcher.innerHTML = logoSvg();

  const wrap = document.createElement("div");
  wrap.className = "ej-drawer-wrap";

  const backdrop = document.createElement("div");
  backdrop.className = "ej-backdrop";

  const drawer = document.createElement("aside");
  drawer.className = "ej-drawer";

  const frame = document.createElement("iframe");
  frame.className = "ej-frame";
  frame.title = "KiwiJob";

  drawer.appendChild(frame);
  wrap.appendChild(backdrop);
  wrap.appendChild(drawer);
  root.appendChild(launcher);
  root.appendChild(wrap);
  shadow.append(style, root);

  let frameLoaded = false;
  function loadFrame(): void {
    if (frameLoaded) return;
    frame.src = chrome.runtime.getURL("page-sidebar.html");
    frameLoaded = true;
  }

  function openDrawer(): void {
    loadFrame();
    wrap.classList.add("ej-open");
  }

  function closeDrawer(): void {
    wrap.classList.remove("ej-open");
  }

  function toggleDrawer(): void {
    if (wrap.classList.contains("ej-open")) closeDrawer();
    else openDrawer();
  }

  launcher.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleDrawer();
  });
  backdrop.addEventListener("click", () => closeDrawer());

  window.addEventListener("message", (ev: MessageEvent) => {
    if (ev.data?.type === KIWIJOB_CLOSE_DRAWER && ev.data?.source === KIWIJOB_EXTENSION_SOURCE) {
      closeDrawer();
    }
  });

  (host as HTMLElement & { __ejToggle?: () => void; __ejClose?: () => void }).__ejToggle = toggleDrawer;
  (host as HTMLElement & { __ejToggle?: () => void; __ejClose?: () => void }).__ejClose = closeDrawer;

  return host;
}

export function initKiwiJobPageHost(): void {
  const p = window.location.protocol;
  if (p !== "http:" && p !== "https:") return;
  ensureHost();
}

export function toggleKiwiJobPageHost(): void {
  const p = window.location.protocol;
  if (p !== "http:" && p !== "https:") return;
  const host = ensureHost();
  const fn = (host as HTMLElement & { __ejToggle?: () => void }).__ejToggle;
  fn?.();
}

const w = "https://d3qngwzf3gjrpb.cloudfront.net", g = [
  "seek.co.nz",
  "seek.com.au",
  "seek.com",
  "linkedin.com",
  "trademe.co.nz",
  "indeed.com",
  "indeed.co.nz",
  "nz.jora.com",
  "jobs.govt.nz",
  "careers.govt.nz",
  "studentjobsearch.co.nz",
  "sjs.co.nz",
  "myjobspace.co.nz",
  "job.co.nz",
  "kiwihealthjobs.com",
  "maoripacificjobs.co.nz",
  "workingin-newzealand.com",
  "workingin.com",
  "talent.com",
  "careerjet.co.nz",
  "adzuna.co.nz",
  "jobted.co.nz",
  "recruit.net",
  "glassdoor.co.nz",
  "whatjobs.com",
  "grabjobs.co",
  "workhere.co.nz",
  "seasonaljobs.co.nz",
  "backpackerboard.co.nz",
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "jobs.lever.co",
  "myworkdayjobs.com",
  "smartrecruiters.com",
  "ashbyhq.com",
  "workable.com",
  "bamboohr.com",
  "breezy.hr",
  "jobvite.com",
  "recruitee.com",
  "successfactors.com",
  "jobs2web.com",
  "oraclecloud.com",
  "taleo.net"
];
let d = null;
function b(t) {
  const n = t.trim().replace(/\/+$/, "");
  return !n || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(n) ? w : n;
}
function p(t) {
  if (!t) return !1;
  try {
    const n = new URL(t);
    if (n.protocol !== "http:" && n.protocol !== "https:") return !1;
    const e = n.hostname.replace(/^www\./i, "").toLowerCase();
    return g.some((a) => e === a || e.endsWith(`.${a}`));
  } catch {
    return !1;
  }
}
function f(t) {
  return typeof t.id != "number" || !p(t.url) ? null : (d = { id: t.id, url: t.url }, d);
}
async function m(t) {
  const n = await chrome.tabs.query(t);
  for (const e of n) {
    const a = f(e);
    if (a) return a;
  }
  return null;
}
async function T() {
  return await m({ active: !0, currentWindow: !0 }) || await m({ active: !0, lastFocusedWindow: !0 }) || d;
}
function k() {
  var t;
  (t = chrome.sidePanel) != null && t.setOptions && (chrome.sidePanel.setOptions({ path: "page-sidebar.html" }), chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: !0 }).catch(() => {
  }));
}
k();
chrome.action.onClicked.addListener((t) => {
  t.id != null && chrome.tabs.sendMessage(t.id, { type: "KIWIJOB_TOGGLE_UI" }).catch(() => {
  });
});
chrome.runtime.onInstalled.addListener(() => {
  k();
});
chrome.tabs.onActivated.addListener(({ tabId: t }) => {
  chrome.tabs.get(t).then((n) => {
    f(n);
  }).catch(() => {
  });
});
chrome.tabs.onUpdated.addListener((t, n, e) => {
  (n.status === "complete" || n.url) && f(e);
});
async function h(t) {
  const n = await t.text();
  try {
    const a = JSON.parse(n).detail;
    if (typeof a == "string") return a;
    if (Array.isArray(a))
      return a.map((r) => r && typeof r == "object" && "msg" in r ? String(r.msg) : String(r)).join("; ");
  } catch {
  }
  return n.slice(0, 800);
}
async function c() {
  const t = await chrome.storage.sync.get(["apiBase"]), n = typeof t.apiBase == "string" ? b(t.apiBase) : w;
  return n !== t.apiBase && await chrome.storage.sync.set({ apiBase: n }), n;
}
async function E() {
  const t = await c(), n = new AbortController(), e = setTimeout(() => n.abort(), 5e3);
  try {
    const a = await fetch(`${t}/health`, { method: "GET", signal: n.signal });
    return { reachable: a.ok, api: t, error: a.ok ? void 0 : `HTTP ${a.status}` };
  } catch (a) {
    return { reachable: !1, api: t, error: a instanceof Error ? a.message : String(a) };
  } finally {
    clearTimeout(e);
  }
}
async function y() {
  const t = await chrome.storage.sync.get(["authToken", "authUser"]), n = typeof t.authToken == "string" ? t.authToken.trim() : "", e = t.authUser && typeof t.authUser == "object" && typeof t.authUser.email == "string" ? t.authUser : null;
  return { token: n, user: e };
}
async function l() {
  const { token: t } = await y(), n = {};
  return t && (n.Authorization = `Bearer ${t}`), n;
}
async function u() {
  return { "Content-Type": "application/json", ...await l() };
}
async function S(t) {
  const n = t;
  if (typeof n.access_token != "string" || !n.user || typeof n.user != "object")
    throw new Error("Invalid auth response");
  return await chrome.storage.sync.set({ authToken: n.access_token, authUser: n.user }), n;
}
chrome.runtime.onMessage.addListener((t, n, e) => ((async () => {
  try {
    if (t.type === "GET_API_BASE") {
      e({ ok: !0, data: await c() });
      return;
    }
    if (t.type === "GET_ACTIVE_JOB_TAB") {
      e({ ok: !0, data: await T() });
      return;
    }
    if (t.type === "API_HEALTH") {
      e({ ok: !0, data: await E() });
      return;
    }
    if (t.type === "SET_API_BASE") {
      await chrome.storage.sync.set({ apiBase: t.apiBase }), e({ ok: !0, data: await c() });
      return;
    }
    if (t.type === "AUTH_STATE") {
      const a = await c(), r = await y();
      try {
        const i = await fetch(`${a}/auth/me`, { method: "GET", credentials: "include", headers: await l() });
        if (i.ok) {
          const o = await i.json();
          await chrome.storage.sync.set({ authUser: o }), e({ ok: !0, data: { token: r.token, user: o } });
          return;
        }
        await chrome.storage.sync.remove(["authToken", "authUser"]), e({ ok: !0, data: { token: "", user: null } });
      } catch {
        e({ ok: !0, data: r });
      }
      return;
    }
    if (t.type === "AUTH_LOGIN" || t.type === "AUTH_REGISTER") {
      const a = await c(), r = t.type === "AUTH_LOGIN" ? "/auth/login" : "/auth/register", i = t.type === "AUTH_LOGIN" ? { email: t.email, password: t.password } : { email: t.email, password: t.password, display_name: t.displayName || "" }, o = await fetch(`${a}${r}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(i)
      });
      if (!o.ok) {
        e({ ok: !1, error: await h(o) });
        return;
      }
      e({ ok: !0, data: await S(await o.json()) });
      return;
    }
    if (t.type === "AUTH_LOGOUT") {
      const a = await c();
      try {
        await fetch(`${a}/auth/logout`, { method: "POST", credentials: "include", headers: await l() });
      } catch {
      }
      await chrome.storage.sync.remove(["authToken", "authUser"]), e({ ok: !0, data: { token: "", user: null } });
      return;
    }
    if (t.type === "SAVE_JOB") {
      const a = await c();
      let r;
      try {
        r = await fetch(`${a}/jobs/save`, {
          method: "POST",
          credentials: "include",
          headers: await u(),
          body: JSON.stringify(t.payload)
        });
      } catch (o) {
        const s = o instanceof Error ? o.message : String(o);
        e({
          ok: !1,
          error: s.includes("Failed to fetch") || s.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend (uvicorn) and open ${a}/health in a tab to verify.` : s
        });
        return;
      }
      if (!r.ok) {
        e({ ok: !1, error: await h(r) });
        return;
      }
      const i = await r.json();
      await chrome.storage.local.set({ lastApplicationId: i.id }), e({ ok: !0, data: i });
      return;
    }
    if (t.type === "PREVIEW_MATCH") {
      const a = await c();
      let r;
      try {
        r = await fetch(`${a}/match/preview`, {
          method: "POST",
          credentials: "include",
          headers: await u(),
          body: JSON.stringify(t.payload)
        });
      } catch (i) {
        const o = i instanceof Error ? i.message : String(i);
        e({
          ok: !1,
          error: o.includes("Failed to fetch") || o.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend and check ${a}/health.` : o
        });
        return;
      }
      if (!r.ok) {
        e({ ok: !1, error: await h(r) });
        return;
      }
      e({ ok: !0, data: await r.json() });
      return;
    }
    if (t.type === "ANALYZE_MATCH") {
      const a = await c();
      let r;
      try {
        r = await fetch(`${a}/match/analyze`, {
          method: "POST",
          credentials: "include",
          headers: await u(),
          body: JSON.stringify({ job_id: t.jobId })
        });
      } catch (o) {
        const s = o instanceof Error ? o.message : String(o);
        e({
          ok: !1,
          error: s.includes("Failed to fetch") || s.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend and check ${a}/health.` : s
        });
        return;
      }
      if (!r.ok) {
        e({ ok: !1, error: await h(r) });
        return;
      }
      const i = await r.json();
      e({ ok: !0, data: i });
      return;
    }
    if (t.type === "GET_MATCH") {
      const a = await c();
      let r;
      try {
        r = await fetch(`${a}/match/${t.jobId}`, {
          method: "GET",
          credentials: "include",
          headers: await l()
        });
      } catch (o) {
        const s = o instanceof Error ? o.message : String(o);
        e({
          ok: !1,
          error: s.includes("Failed to fetch") || s.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend and check ${a}/health.` : s
        });
        return;
      }
      if (!r.ok) {
        e({ ok: !1, error: await h(r) });
        return;
      }
      const i = await r.json();
      e({ ok: !0, data: i });
      return;
    }
    if (t.type === "GET_INSIGHTS") {
      const a = await c();
      let r;
      try {
        const i = Math.max(1, Math.min(365, Number(t.days) || 7)), o = new URLSearchParams({ days: String(i) });
        t.start && o.set("start", t.start), t.end && o.set("end", t.end), r = await fetch(`${a}/analytics/insights?${o.toString()}`, {
          method: "GET",
          credentials: "include",
          headers: await l()
        });
      } catch (i) {
        const o = i instanceof Error ? i.message : String(i);
        e({
          ok: !1,
          error: o.includes("Failed to fetch") || o.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend and check ${a}/health.` : o
        });
        return;
      }
      if (!r.ok) {
        e({ ok: !1, error: await h(r) });
        return;
      }
      e({ ok: !0, data: await r.json() });
      return;
    }
    if (t.type === "GET_CV_PROFILE") {
      const a = await c();
      let r;
      try {
        const i = typeof t.resumeId == "number" ? `/resumes/${t.resumeId}/profile` : "/resumes/profile";
        r = await fetch(`${a}${i}`, {
          method: "GET",
          credentials: "include",
          headers: await l()
        });
      } catch (i) {
        const o = i instanceof Error ? i.message : String(i);
        e({
          ok: !1,
          error: o.includes("Failed to fetch") || o.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend and check ${a}/health.` : o
        });
        return;
      }
      if (!r.ok) {
        e({ ok: !1, error: await h(r) });
        return;
      }
      e({ ok: !0, data: await r.json() });
      return;
    }
    if (t.type === "GET_RESUMES") {
      const a = await c();
      let r;
      try {
        r = await fetch(`${a}/resumes`, {
          method: "GET",
          credentials: "include",
          headers: await l()
        });
      } catch (i) {
        const o = i instanceof Error ? i.message : String(i);
        e({
          ok: !1,
          error: o.includes("Failed to fetch") || o.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend and check ${a}/health.` : o
        });
        return;
      }
      if (!r.ok) {
        e({ ok: !1, error: await h(r) });
        return;
      }
      e({ ok: !0, data: await r.json() });
      return;
    }
    e({ ok: !1, error: "Unknown message" });
  } catch (a) {
    e({ ok: !1, error: a.message });
  }
})(), !0));

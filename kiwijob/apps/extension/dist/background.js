const w = "http://localhost:8000";
function u() {
  var t;
  (t = chrome.sidePanel) != null && t.setOptions && (chrome.sidePanel.setOptions({ path: "page-sidebar.html" }), chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: !0 }).catch(() => {
  }));
}
u();
chrome.action.onClicked.addListener((t) => {
  t.id != null && chrome.tabs.sendMessage(t.id, { type: "KIWIJOB_TOGGLE_UI" }).catch(() => {
  });
});
chrome.runtime.onInstalled.addListener(() => {
  u();
});
async function h(t) {
  const n = await t.text();
  try {
    const r = JSON.parse(n).detail;
    if (typeof r == "string") return r;
    if (Array.isArray(r))
      return r.map((a) => a && typeof a == "object" && "msg" in a ? String(a.msg) : String(a)).join("; ");
  } catch {
  }
  return n.slice(0, 800);
}
async function c() {
  const t = await chrome.storage.sync.get(["apiBase"]);
  return typeof t.apiBase == "string" && t.apiBase.length ? t.apiBase.replace(/\/$/, "") : w;
}
async function f() {
  const t = await chrome.storage.sync.get(["authToken", "authUser"]), n = typeof t.authToken == "string" ? t.authToken.trim() : "", o = t.authUser && typeof t.authUser == "object" && typeof t.authUser.email == "string" ? t.authUser : null;
  return { token: n, user: o };
}
async function l() {
  const { token: t } = await f(), n = {};
  return t && (n.Authorization = `Bearer ${t}`), n;
}
async function d() {
  return { "Content-Type": "application/json", ...await l() };
}
async function k(t) {
  const n = t;
  if (typeof n.access_token != "string" || !n.user || typeof n.user != "object")
    throw new Error("Invalid auth response");
  return await chrome.storage.sync.set({ authToken: n.access_token, authUser: n.user }), n;
}
chrome.runtime.onMessage.addListener((t, n, o) => ((async () => {
  try {
    if (t.type === "GET_API_BASE") {
      o({ ok: !0, data: await c() });
      return;
    }
    if (t.type === "SET_API_BASE") {
      await chrome.storage.sync.set({ apiBase: t.apiBase }), o({ ok: !0, data: await c() });
      return;
    }
    if (t.type === "AUTH_STATE") {
      const r = await c(), a = await f();
      try {
        const i = await fetch(`${r}/auth/me`, { method: "GET", credentials: "include", headers: await l() });
        if (i.ok) {
          const e = await i.json();
          await chrome.storage.sync.set({ authUser: e }), o({ ok: !0, data: { token: a.token, user: e } });
          return;
        }
        await chrome.storage.sync.remove(["authToken", "authUser"]), o({ ok: !0, data: { token: "", user: null } });
      } catch {
        o({ ok: !0, data: a });
      }
      return;
    }
    if (t.type === "AUTH_LOGIN" || t.type === "AUTH_REGISTER") {
      const r = await c(), a = t.type === "AUTH_LOGIN" ? "/auth/login" : "/auth/register", i = t.type === "AUTH_LOGIN" ? { email: t.email, password: t.password } : { email: t.email, password: t.password, display_name: t.displayName || "" }, e = await fetch(`${r}${a}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(i)
      });
      if (!e.ok) {
        o({ ok: !1, error: await h(e) });
        return;
      }
      o({ ok: !0, data: await k(await e.json()) });
      return;
    }
    if (t.type === "AUTH_LOGOUT") {
      const r = await c();
      try {
        await fetch(`${r}/auth/logout`, { method: "POST", credentials: "include", headers: await l() });
      } catch {
      }
      await chrome.storage.sync.remove(["authToken", "authUser"]), o({ ok: !0, data: { token: "", user: null } });
      return;
    }
    if (t.type === "SAVE_JOB") {
      const r = await c();
      let a;
      try {
        a = await fetch(`${r}/jobs/save`, {
          method: "POST",
          credentials: "include",
          headers: await d(),
          body: JSON.stringify(t.payload)
        });
      } catch (e) {
        const s = e instanceof Error ? e.message : String(e);
        o({
          ok: !1,
          error: s.includes("Failed to fetch") || s.includes("NetworkError") ? `Cannot reach API at ${r}. Start the backend (uvicorn) and open ${r}/health in a tab to verify.` : s
        });
        return;
      }
      if (!a.ok) {
        o({ ok: !1, error: await h(a) });
        return;
      }
      const i = await a.json();
      await chrome.storage.local.set({ lastApplicationId: i.id }), o({ ok: !0, data: i });
      return;
    }
    if (t.type === "PREVIEW_MATCH") {
      const r = await c();
      let a;
      try {
        a = await fetch(`${r}/match/preview`, {
          method: "POST",
          credentials: "include",
          headers: await d(),
          body: JSON.stringify(t.payload)
        });
      } catch (i) {
        const e = i instanceof Error ? i.message : String(i);
        o({
          ok: !1,
          error: e.includes("Failed to fetch") || e.includes("NetworkError") ? `Cannot reach API at ${r}. Start the backend and check ${r}/health.` : e
        });
        return;
      }
      if (!a.ok) {
        o({ ok: !1, error: await h(a) });
        return;
      }
      o({ ok: !0, data: await a.json() });
      return;
    }
    if (t.type === "ANALYZE_MATCH") {
      const r = await c();
      let a;
      try {
        a = await fetch(`${r}/match/analyze`, {
          method: "POST",
          credentials: "include",
          headers: await d(),
          body: JSON.stringify({ job_id: t.jobId })
        });
      } catch (e) {
        const s = e instanceof Error ? e.message : String(e);
        o({
          ok: !1,
          error: s.includes("Failed to fetch") || s.includes("NetworkError") ? `Cannot reach API at ${r}. Start the backend and check ${r}/health.` : s
        });
        return;
      }
      if (!a.ok) {
        o({ ok: !1, error: await h(a) });
        return;
      }
      const i = await a.json();
      o({ ok: !0, data: i });
      return;
    }
    if (t.type === "GET_MATCH") {
      const r = await c();
      let a;
      try {
        a = await fetch(`${r}/match/${t.jobId}`, {
          method: "GET",
          credentials: "include",
          headers: await l()
        });
      } catch (e) {
        const s = e instanceof Error ? e.message : String(e);
        o({
          ok: !1,
          error: s.includes("Failed to fetch") || s.includes("NetworkError") ? `Cannot reach API at ${r}. Start the backend and check ${r}/health.` : s
        });
        return;
      }
      if (!a.ok) {
        o({ ok: !1, error: await h(a) });
        return;
      }
      const i = await a.json();
      o({ ok: !0, data: i });
      return;
    }
    if (t.type === "GET_INSIGHTS") {
      const r = await c();
      let a;
      try {
        const i = Math.max(1, Math.min(365, Number(t.days) || 7)), e = new URLSearchParams({ days: String(i) });
        t.start && e.set("start", t.start), t.end && e.set("end", t.end), a = await fetch(`${r}/analytics/insights?${e.toString()}`, {
          method: "GET",
          credentials: "include",
          headers: await l()
        });
      } catch (i) {
        const e = i instanceof Error ? i.message : String(i);
        o({
          ok: !1,
          error: e.includes("Failed to fetch") || e.includes("NetworkError") ? `Cannot reach API at ${r}. Start the backend and check ${r}/health.` : e
        });
        return;
      }
      if (!a.ok) {
        o({ ok: !1, error: await h(a) });
        return;
      }
      o({ ok: !0, data: await a.json() });
      return;
    }
    if (t.type === "GET_CV_PROFILE") {
      const r = await c();
      let a;
      try {
        const i = typeof t.resumeId == "number" ? `/resumes/${t.resumeId}/profile` : "/resumes/profile";
        a = await fetch(`${r}${i}`, {
          method: "GET",
          credentials: "include",
          headers: await l()
        });
      } catch (i) {
        const e = i instanceof Error ? i.message : String(i);
        o({
          ok: !1,
          error: e.includes("Failed to fetch") || e.includes("NetworkError") ? `Cannot reach API at ${r}. Start the backend and check ${r}/health.` : e
        });
        return;
      }
      if (!a.ok) {
        o({ ok: !1, error: await h(a) });
        return;
      }
      o({ ok: !0, data: await a.json() });
      return;
    }
    if (t.type === "GET_RESUMES") {
      const r = await c();
      let a;
      try {
        a = await fetch(`${r}/resumes`, {
          method: "GET",
          credentials: "include",
          headers: await l()
        });
      } catch (i) {
        const e = i instanceof Error ? i.message : String(i);
        o({
          ok: !1,
          error: e.includes("Failed to fetch") || e.includes("NetworkError") ? `Cannot reach API at ${r}. Start the backend and check ${r}/health.` : e
        });
        return;
      }
      if (!a.ok) {
        o({ ok: !1, error: await h(a) });
        return;
      }
      o({ ok: !0, data: await a.json() });
      return;
    }
    o({ ok: !1, error: "Unknown message" });
  } catch (r) {
    o({ ok: !1, error: r.message });
  }
})(), !0));

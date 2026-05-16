const p = {
  fullName: "",
  email: "",
  phone: "",
  linkedInUrl: "",
  portfolioUrl: "",
  githubUrl: "",
  city: "",
  country: "",
  workAuthorization: "",
  sponsorship: "",
  salaryExpectation: "",
  noticePeriod: "",
  skills: "",
  summary: "",
  coverLetter: ""
}, m = {
  aiUniqueQuestions: !0,
  continuous: !1,
  fields: {
    basic: !0,
    contact: !0,
    links: !0,
    location: !0,
    workAuthorization: !0,
    salary: !0,
    skills: !1,
    coverLetter: !0
  }
}, b = "http://localhost:8000";
function w() {
  var t;
  (t = chrome.sidePanel) != null && t.setOptions && (chrome.sidePanel.setOptions({ path: "page-sidebar.html" }), chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: !1 }).catch(() => {
  }));
}
w();
chrome.action.onClicked.addListener((t) => {
  t.id != null && chrome.tabs.sendMessage(t.id, { type: "KIWIJOB_TOGGLE_UI" }).catch(() => {
  });
});
const g = "kiwijob-fill-application-form";
function U(t) {
  const o = p;
  if (!t || typeof t != "object") return { ...o };
  const e = t, c = (a) => (typeof e[a] == "string" ? e[a] : "") || "";
  return {
    fullName: c("fullName"),
    email: c("email"),
    phone: c("phone"),
    linkedInUrl: c("linkedInUrl"),
    portfolioUrl: c("portfolioUrl"),
    githubUrl: c("githubUrl"),
    city: c("city"),
    country: c("country"),
    workAuthorization: c("workAuthorization"),
    sponsorship: c("sponsorship"),
    salaryExpectation: c("salaryExpectation"),
    noticePeriod: c("noticePeriod"),
    skills: c("skills"),
    summary: c("summary"),
    coverLetter: c("coverLetter")
  };
}
function $(t) {
  var o, e;
  return t != null && t.upload ? {
    fullName: t.full_name || "",
    email: t.email || "",
    phone: t.phone || "",
    skills: t.skills.join(", "),
    linkedInUrl: t.links.find((c) => /linkedin/i.test(c)) || "",
    portfolioUrl: t.links.find((c) => !/linkedin|github/i.test(c)) || "",
    githubUrl: t.links.find((c) => /github/i.test(c)) || "",
    summary: [
      (o = t.experience[0]) != null && o.title ? `Most recent role: ${t.experience[0].title}` : "",
      (e = t.education[0]) != null && e.school ? `Education: ${t.education[0].school}` : ""
    ].filter(Boolean).join(`
`)
  } : {};
}
function _(t) {
  if (!t || typeof t != "object") return m;
  const o = t;
  return {
    ...m,
    ...o,
    fields: { ...m.fields, ...o.fields || {} }
  };
}
async function T() {
  const t = await chrome.storage.sync.get(["autofillSettings"]);
  return _(t.autofillSettings);
}
async function A(t) {
  const o = await l();
  let e = { ...p };
  try {
    const c = await fetch(`${o}/me/applicant-profile`, { method: "GET", credentials: "include", headers: await u() });
    c.ok && (e = U(await c.json()));
  } catch {
  }
  try {
    const c = await chrome.storage.local.get(["selectedResumeId"]), a = typeof c.selectedResumeId == "number" ? c.selectedResumeId : void 0, r = a ? `/resumes/${a}/profile` : "/resumes/profile", n = await fetch(`${o}${r}`, { method: "GET", credentials: "include", headers: await u() });
    n.ok && (e = { ...e, ...$(await n.json()) });
  } catch {
  }
  return e;
}
function E(t) {
  return !t || t.startsWith("chrome://") || t.startsWith("edge://") || t.startsWith("about:") || t.startsWith("devtools:") || t.startsWith("chrome-extension://") ? !1 : t.startsWith("http://") || t.startsWith("https://");
}
async function I() {
  const o = (await chrome.tabs.query({ active: !0, currentWindow: !0 }))[0], e = o == null ? void 0 : o.id, c = o == null ? void 0 : o.url;
  if (typeof e != "number" || !c || !E(c))
    return { filled: [], skippedEmpty: ["active tab"] };
  const a = await A(), r = await T();
  try {
    return await chrome.tabs.sendMessage(e, { type: "AUTOFILL_TAB", profile: a, settings: r });
  } catch (n) {
    const i = n instanceof Error ? n.message : String(n);
    return { filled: [], skippedEmpty: [`page script: ${i || "not reachable"}`] };
  }
}
function P() {
  chrome.contextMenus && chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: g,
      title: "Fill form with KiwiJob profile",
      contexts: ["page", "frame", "editable"]
    });
  });
}
chrome.runtime.onInstalled.addListener(() => {
  P(), w();
});
var y;
(y = chrome.contextMenus) == null || y.onClicked.addListener((t, o) => {
  t.menuItemId !== g || typeof (o == null ? void 0 : o.id) != "number" || !o.url || E(o.url) && (async () => {
    const e = await A(o.url), c = await T();
    try {
      await chrome.tabs.sendMessage(o.id, { type: "AUTOFILL_TAB", profile: e, settings: c });
    } catch {
    }
  })();
});
var k;
(k = chrome.commands) == null || k.onCommand.addListener((t) => {
  t === "kiwijob-autofill" && I();
});
async function h(t) {
  const o = await t.text();
  try {
    const c = JSON.parse(o).detail;
    if (typeof c == "string") return c;
    if (Array.isArray(c))
      return c.map((a) => a && typeof a == "object" && "msg" in a ? String(a.msg) : String(a)).join("; ");
  } catch {
  }
  return o.slice(0, 800);
}
async function l() {
  const t = await chrome.storage.sync.get(["apiBase"]);
  return typeof t.apiBase == "string" && t.apiBase.length ? t.apiBase.replace(/\/$/, "") : b;
}
async function S() {
  const t = await chrome.storage.sync.get(["authToken", "authUser"]), o = typeof t.authToken == "string" ? t.authToken.trim() : "", e = t.authUser && typeof t.authUser == "object" && typeof t.authUser.email == "string" ? t.authUser : null;
  return { token: o, user: e };
}
async function u() {
  const { token: t } = await S(), o = {};
  return t && (o.Authorization = `Bearer ${t}`), o;
}
async function f() {
  return { "Content-Type": "application/json", ...await u() };
}
async function L(t) {
  const o = t;
  if (typeof o.access_token != "string" || !o.user || typeof o.user != "object")
    throw new Error("Invalid auth response");
  return await chrome.storage.sync.set({ authToken: o.access_token, authUser: o.user }), o;
}
chrome.runtime.onMessage.addListener((t, o, e) => ((async () => {
  var c;
  try {
    if (t.type === "GET_API_BASE") {
      e({ ok: !0, data: await l() });
      return;
    }
    if (t.type === "SET_API_BASE") {
      await chrome.storage.sync.set({ apiBase: t.apiBase }), e({ ok: !0, data: await l() });
      return;
    }
    if (t.type === "AUTH_STATE") {
      const a = await l(), r = await S();
      try {
        const n = await fetch(`${a}/auth/me`, { method: "GET", credentials: "include", headers: await u() });
        if (n.ok) {
          const i = await n.json();
          await chrome.storage.sync.set({ authUser: i }), e({ ok: !0, data: { token: r.token, user: i } });
          return;
        }
        await chrome.storage.sync.remove(["authToken", "authUser"]), e({ ok: !0, data: { token: "", user: null } });
      } catch {
        e({ ok: !0, data: r });
      }
      return;
    }
    if (t.type === "AUTH_LOGIN" || t.type === "AUTH_REGISTER") {
      const a = await l(), r = t.type === "AUTH_LOGIN" ? "/auth/login" : "/auth/register", n = t.type === "AUTH_LOGIN" ? { email: t.email, password: t.password } : { email: t.email, password: t.password, display_name: t.displayName || "" }, i = await fetch(`${a}${r}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(n)
      });
      if (!i.ok) {
        e({ ok: !1, error: await h(i) });
        return;
      }
      e({ ok: !0, data: await L(await i.json()) });
      return;
    }
    if (t.type === "AUTH_LOGOUT") {
      const a = await l();
      try {
        await fetch(`${a}/auth/logout`, { method: "POST", credentials: "include", headers: await u() });
      } catch {
      }
      await chrome.storage.sync.remove(["authToken", "authUser"]), e({ ok: !0, data: { token: "", user: null } });
      return;
    }
    if (t.type === "AUTOFILL_ACTIVE_TAB") {
      e({ ok: !0, data: await I() });
      return;
    }
    if (t.type === "SAVE_JOB") {
      const a = await l();
      let r;
      try {
        r = await fetch(`${a}/jobs/save`, {
          method: "POST",
          credentials: "include",
          headers: await f(),
          body: JSON.stringify(t.payload)
        });
      } catch (i) {
        const s = i instanceof Error ? i.message : String(i);
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
      const n = await r.json();
      await chrome.storage.local.set({ lastApplicationId: n.id }), e({ ok: !0, data: n });
      return;
    }
    if (t.type === "TRACK_EVENT") {
      const a = await l();
      let r;
      try {
        r = await fetch(`${a}/events/track`, {
          method: "POST",
          credentials: "include",
          headers: await f(),
          body: JSON.stringify(t.payload)
        });
      } catch (s) {
        const d = s instanceof Error ? s.message : String(s);
        e({
          ok: !1,
          error: d.includes("Failed to fetch") || d.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend and check ${a}/health.` : d
        });
        return;
      }
      if (!r.ok) {
        e({ ok: !1, error: await h(r) });
        return;
      }
      const n = await r.json(), i = (c = n.application) == null ? void 0 : c.id;
      typeof i == "number" && await chrome.storage.local.set({ lastApplicationId: i }), e({ ok: !0, data: n });
      return;
    }
    if (t.type === "PREVIEW_MATCH") {
      const a = await l();
      let r;
      try {
        r = await fetch(`${a}/match/preview`, {
          method: "POST",
          credentials: "include",
          headers: await f(),
          body: JSON.stringify(t.payload)
        });
      } catch (n) {
        const i = n instanceof Error ? n.message : String(n);
        e({
          ok: !1,
          error: i.includes("Failed to fetch") || i.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend and check ${a}/health.` : i
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
      const a = await l();
      let r;
      try {
        r = await fetch(`${a}/match/analyze`, {
          method: "POST",
          credentials: "include",
          headers: await f(),
          body: JSON.stringify({ job_id: t.jobId })
        });
      } catch (i) {
        const s = i instanceof Error ? i.message : String(i);
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
      const n = await r.json();
      e({ ok: !0, data: n });
      return;
    }
    if (t.type === "GET_MATCH") {
      const a = await l();
      let r;
      try {
        r = await fetch(`${a}/match/${t.jobId}`, {
          method: "GET",
          credentials: "include",
          headers: await u()
        });
      } catch (i) {
        const s = i instanceof Error ? i.message : String(i);
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
      const n = await r.json();
      e({ ok: !0, data: n });
      return;
    }
    if (t.type === "GET_INSIGHTS") {
      const a = await l();
      let r;
      try {
        const n = Math.max(1, Math.min(365, Number(t.days) || 7)), i = new URLSearchParams({ days: String(n) });
        t.start && i.set("start", t.start), t.end && i.set("end", t.end), r = await fetch(`${a}/analytics/insights?${i.toString()}`, {
          method: "GET",
          credentials: "include",
          headers: await u()
        });
      } catch (n) {
        const i = n instanceof Error ? n.message : String(n);
        e({
          ok: !1,
          error: i.includes("Failed to fetch") || i.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend and check ${a}/health.` : i
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
      const a = await l();
      let r;
      try {
        const n = typeof t.resumeId == "number" ? `/resumes/${t.resumeId}/profile` : "/resumes/profile";
        r = await fetch(`${a}${n}`, {
          method: "GET",
          credentials: "include",
          headers: await u()
        });
      } catch (n) {
        const i = n instanceof Error ? n.message : String(n);
        e({
          ok: !1,
          error: i.includes("Failed to fetch") || i.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend and check ${a}/health.` : i
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
      const a = await l();
      let r;
      try {
        r = await fetch(`${a}/resumes`, {
          method: "GET",
          credentials: "include",
          headers: await u()
        });
      } catch (n) {
        const i = n instanceof Error ? n.message : String(n);
        e({
          ok: !1,
          error: i.includes("Failed to fetch") || i.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend and check ${a}/health.` : i
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

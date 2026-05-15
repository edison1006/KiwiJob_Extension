const y = {
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
};
function b(t) {
  const c = t.trim();
  if (!c) return "";
  try {
    return decodeURIComponent(c.replace(/\+/g, " "));
  } catch {
    return c;
  }
}
function T(t) {
  return t.toLowerCase().replace(/[-_]/g, "");
}
function $(t, c) {
  const e = { ...t };
  let n = "", a = "";
  for (const o of c) {
    const i = b(o.value || "");
    if (!i) continue;
    const r = T(o.name);
    if (!e.email && (r === "email" || r.endsWith("email") || r === "useremail")) {
      i.includes("@") && (e.email = i);
      continue;
    }
    if (!e.phone && (r.includes("phone") || r.includes("mobile") || r.includes("cell") || r === "tel")) {
      e.phone = i;
      continue;
    }
    if (!e.linkedInUrl && (r.includes("linkedin") || r === "inurl")) {
      (i.includes("linkedin") || i.startsWith("http")) && (e.linkedInUrl = i);
      continue;
    }
    if (!e.portfolioUrl && (r.includes("website") || r.includes("portfolio") || r === "url" || r === "homepage")) {
      i.startsWith("http") && (e.portfolioUrl = i);
      continue;
    }
    if (!e.city && r.includes("city") && !r.includes("company")) {
      e.city = i;
      continue;
    }
    if (!e.country && (r.includes("country") || r === "nation")) {
      e.country = i;
      continue;
    }
    if (!e.fullName && (r === "name" || r === "fullname" || r === "displayname")) {
      e.fullName = i;
      continue;
    }
    (r === "firstname" || r === "fname" || r === "givenname") && (n = i), (r === "lastname" || r === "lname" || r === "surname" || r === "familyname") && (a = i);
  }
  return !e.fullName.trim() && (n || a) && (e.fullName = [n, a].filter(Boolean).join(" ").trim()), e;
}
const P = "http://localhost:8000";
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
  const c = y;
  if (!t || typeof t != "object") return { ...c };
  const e = t, n = (a) => (typeof e[a] == "string" ? e[a] : "") || "";
  return {
    fullName: n("fullName"),
    email: n("email"),
    phone: n("phone"),
    linkedInUrl: n("linkedInUrl"),
    portfolioUrl: n("portfolioUrl"),
    githubUrl: n("githubUrl"),
    city: n("city"),
    country: n("country"),
    workAuthorization: n("workAuthorization"),
    sponsorship: n("sponsorship"),
    salaryExpectation: n("salaryExpectation"),
    noticePeriod: n("noticePeriod"),
    skills: n("skills"),
    summary: n("summary"),
    coverLetter: n("coverLetter")
  };
}
function L(t) {
  var c, e;
  return t != null && t.upload ? {
    fullName: t.full_name || "",
    email: t.email || "",
    phone: t.phone || "",
    skills: t.skills.join(", "),
    linkedInUrl: t.links.find((n) => /linkedin/i.test(n)) || "",
    portfolioUrl: t.links.find((n) => !/linkedin|github/i.test(n)) || "",
    githubUrl: t.links.find((n) => /github/i.test(n)) || "",
    summary: [
      (c = t.experience[0]) != null && c.title ? `Most recent role: ${t.experience[0].title}` : "",
      (e = t.education[0]) != null && e.school ? `Education: ${t.education[0].school}` : ""
    ].filter(Boolean).join(`
`)
  } : {};
}
function _(t) {
  if (!t || typeof t != "object") return m;
  const c = t;
  return {
    ...m,
    ...c,
    fields: { ...m.fields, ...c.fields || {} }
  };
}
async function E() {
  const t = await chrome.storage.sync.get(["autofillSettings"]);
  return _(t.autofillSettings);
}
async function I(t) {
  const c = await l();
  let e = { ...y };
  try {
    const a = await fetch(`${c}/me/applicant-profile`, { method: "GET", headers: await u() });
    a.ok && (e = U(await a.json()));
  } catch {
  }
  try {
    const a = await chrome.storage.local.get(["selectedResumeId"]), o = typeof a.selectedResumeId == "number" ? a.selectedResumeId : void 0, i = o ? `/resumes/${o}/profile` : "/resumes/profile", r = await fetch(`${c}${i}`, { method: "GET", headers: await u() });
    r.ok && (e = { ...e, ...L(await r.json()) });
  } catch {
  }
  let n = [];
  try {
    n = await chrome.cookies.getAll({ url: t });
  } catch {
    n = [];
  }
  return $(e, n);
}
function A(t) {
  return !t || t.startsWith("chrome://") || t.startsWith("edge://") || t.startsWith("about:") || t.startsWith("devtools:") || t.startsWith("chrome-extension://") ? !1 : t.startsWith("http://") || t.startsWith("https://");
}
async function S() {
  const c = (await chrome.tabs.query({ active: !0, currentWindow: !0 }))[0], e = c == null ? void 0 : c.id, n = c == null ? void 0 : c.url;
  if (typeof e != "number" || !n || !A(n))
    return { filled: [], skippedEmpty: ["active tab"] };
  const a = await I(n), o = await E();
  try {
    return await chrome.tabs.sendMessage(e, { type: "AUTOFILL_TAB", profile: a, settings: o });
  } catch (i) {
    const r = i instanceof Error ? i.message : String(i);
    return { filled: [], skippedEmpty: [`page script: ${r || "not reachable"}`] };
  }
}
function v() {
  chrome.contextMenus && chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: g,
      title: "Fill form with KiwiJob profile",
      contexts: ["page", "frame", "editable"]
    });
  });
}
chrome.runtime.onInstalled.addListener(() => {
  v(), w();
});
var p;
(p = chrome.contextMenus) == null || p.onClicked.addListener((t, c) => {
  t.menuItemId !== g || typeof (c == null ? void 0 : c.id) != "number" || !c.url || A(c.url) && (async () => {
    const e = await I(c.url), n = await E();
    try {
      await chrome.tabs.sendMessage(c.id, { type: "AUTOFILL_TAB", profile: e, settings: n });
    } catch {
    }
  })();
});
var k;
(k = chrome.commands) == null || k.onCommand.addListener((t) => {
  t === "kiwijob-autofill" && S();
});
async function f(t) {
  const c = await t.text();
  try {
    const n = JSON.parse(c).detail;
    if (typeof n == "string") return n;
    if (Array.isArray(n))
      return n.map((a) => a && typeof a == "object" && "msg" in a ? String(a.msg) : String(a)).join("; ");
  } catch {
  }
  return c.slice(0, 800);
}
async function l() {
  const t = await chrome.storage.sync.get(["apiBase"]);
  return typeof t.apiBase == "string" && t.apiBase.length ? t.apiBase.replace(/\/$/, "") : P;
}
async function u() {
  const t = await chrome.storage.sync.get(["mockUserId"]), c = {}, e = typeof t.mockUserId == "string" ? t.mockUserId.trim() : "";
  return e && !/https?:\/\//i.test(e) && /^\d+$/.test(e) && (c["X-Mock-User-Id"] = e), c;
}
async function h() {
  return { "Content-Type": "application/json", ...await u() };
}
chrome.runtime.onMessage.addListener((t, c, e) => ((async () => {
  var n;
  try {
    if (t.type === "GET_API_BASE") {
      e({ ok: !0, data: await l() });
      return;
    }
    if (t.type === "SET_API_BASE") {
      await chrome.storage.sync.set({ apiBase: t.apiBase }), e({ ok: !0, data: await l() });
      return;
    }
    if (t.type === "AUTOFILL_ACTIVE_TAB") {
      e({ ok: !0, data: await S() });
      return;
    }
    if (t.type === "SAVE_JOB") {
      const a = await l();
      let o;
      try {
        o = await fetch(`${a}/jobs/save`, {
          method: "POST",
          headers: await h(),
          body: JSON.stringify(t.payload)
        });
      } catch (r) {
        const s = r instanceof Error ? r.message : String(r);
        e({
          ok: !1,
          error: s.includes("Failed to fetch") || s.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend (uvicorn) and open ${a}/health in a tab to verify.` : s
        });
        return;
      }
      if (!o.ok) {
        e({ ok: !1, error: await f(o) });
        return;
      }
      const i = await o.json();
      await chrome.storage.local.set({ lastApplicationId: i.id }), e({ ok: !0, data: i });
      return;
    }
    if (t.type === "TRACK_EVENT") {
      const a = await l();
      let o;
      try {
        o = await fetch(`${a}/events/track`, {
          method: "POST",
          headers: await h(),
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
      if (!o.ok) {
        e({ ok: !1, error: await f(o) });
        return;
      }
      const i = await o.json(), r = (n = i.application) == null ? void 0 : n.id;
      typeof r == "number" && await chrome.storage.local.set({ lastApplicationId: r }), e({ ok: !0, data: i });
      return;
    }
    if (t.type === "PREVIEW_MATCH") {
      const a = await l();
      let o;
      try {
        o = await fetch(`${a}/match/preview`, {
          method: "POST",
          headers: await h(),
          body: JSON.stringify(t.payload)
        });
      } catch (i) {
        const r = i instanceof Error ? i.message : String(i);
        e({
          ok: !1,
          error: r.includes("Failed to fetch") || r.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend and check ${a}/health.` : r
        });
        return;
      }
      if (!o.ok) {
        e({ ok: !1, error: await f(o) });
        return;
      }
      e({ ok: !0, data: await o.json() });
      return;
    }
    if (t.type === "ANALYZE_MATCH") {
      const a = await l();
      let o;
      try {
        o = await fetch(`${a}/match/analyze`, {
          method: "POST",
          headers: await h(),
          body: JSON.stringify({ job_id: t.jobId })
        });
      } catch (r) {
        const s = r instanceof Error ? r.message : String(r);
        e({
          ok: !1,
          error: s.includes("Failed to fetch") || s.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend and check ${a}/health.` : s
        });
        return;
      }
      if (!o.ok) {
        e({ ok: !1, error: await f(o) });
        return;
      }
      const i = await o.json();
      e({ ok: !0, data: i });
      return;
    }
    if (t.type === "GET_MATCH") {
      const a = await l();
      let o;
      try {
        o = await fetch(`${a}/match/${t.jobId}`, {
          method: "GET",
          headers: await u()
        });
      } catch (r) {
        const s = r instanceof Error ? r.message : String(r);
        e({
          ok: !1,
          error: s.includes("Failed to fetch") || s.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend and check ${a}/health.` : s
        });
        return;
      }
      if (!o.ok) {
        e({ ok: !1, error: await f(o) });
        return;
      }
      const i = await o.json();
      e({ ok: !0, data: i });
      return;
    }
    if (t.type === "GET_INSIGHTS") {
      const a = await l();
      let o;
      try {
        const i = Math.max(1, Math.min(365, Number(t.days) || 7)), r = new URLSearchParams({ days: String(i) });
        t.start && r.set("start", t.start), t.end && r.set("end", t.end), o = await fetch(`${a}/analytics/insights?${r.toString()}`, {
          method: "GET",
          headers: await u()
        });
      } catch (i) {
        const r = i instanceof Error ? i.message : String(i);
        e({
          ok: !1,
          error: r.includes("Failed to fetch") || r.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend and check ${a}/health.` : r
        });
        return;
      }
      if (!o.ok) {
        e({ ok: !1, error: await f(o) });
        return;
      }
      e({ ok: !0, data: await o.json() });
      return;
    }
    if (t.type === "GET_CV_PROFILE") {
      const a = await l();
      let o;
      try {
        const i = typeof t.resumeId == "number" ? `/resumes/${t.resumeId}/profile` : "/resumes/profile";
        o = await fetch(`${a}${i}`, {
          method: "GET",
          headers: await u()
        });
      } catch (i) {
        const r = i instanceof Error ? i.message : String(i);
        e({
          ok: !1,
          error: r.includes("Failed to fetch") || r.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend and check ${a}/health.` : r
        });
        return;
      }
      if (!o.ok) {
        e({ ok: !1, error: await f(o) });
        return;
      }
      e({ ok: !0, data: await o.json() });
      return;
    }
    if (t.type === "GET_RESUMES") {
      const a = await l();
      let o;
      try {
        o = await fetch(`${a}/resumes`, {
          method: "GET",
          headers: await u()
        });
      } catch (i) {
        const r = i instanceof Error ? i.message : String(i);
        e({
          ok: !1,
          error: r.includes("Failed to fetch") || r.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend and check ${a}/health.` : r
        });
        return;
      }
      if (!o.ok) {
        e({ ok: !1, error: await f(o) });
        return;
      }
      e({ ok: !0, data: await o.json() });
      return;
    }
    e({ ok: !1, error: "Unknown message" });
  } catch (a) {
    e({ ok: !1, error: a.message });
  }
})(), !0));

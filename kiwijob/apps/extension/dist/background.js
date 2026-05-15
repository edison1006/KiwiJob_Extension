const k = {
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
}, d = {
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
function T(t) {
  const o = t.trim();
  if (!o) return "";
  try {
    return decodeURIComponent(o.replace(/\+/g, " "));
  } catch {
    return o;
  }
}
function U(t) {
  return t.toLowerCase().replace(/[-_]/g, "");
}
function b(t, o) {
  const e = { ...t };
  let r = "", a = "";
  for (const c of o) {
    const n = T(c.value || "");
    if (!n) continue;
    const i = U(c.name);
    if (!e.email && (i === "email" || i.endsWith("email") || i === "useremail")) {
      n.includes("@") && (e.email = n);
      continue;
    }
    if (!e.phone && (i.includes("phone") || i.includes("mobile") || i.includes("cell") || i === "tel")) {
      e.phone = n;
      continue;
    }
    if (!e.linkedInUrl && (i.includes("linkedin") || i === "inurl")) {
      (n.includes("linkedin") || n.startsWith("http")) && (e.linkedInUrl = n);
      continue;
    }
    if (!e.portfolioUrl && (i.includes("website") || i.includes("portfolio") || i === "url" || i === "homepage")) {
      n.startsWith("http") && (e.portfolioUrl = n);
      continue;
    }
    if (!e.city && i.includes("city") && !i.includes("company")) {
      e.city = n;
      continue;
    }
    if (!e.country && (i.includes("country") || i === "nation")) {
      e.country = n;
      continue;
    }
    if (!e.fullName && (i === "name" || i === "fullname" || i === "displayname")) {
      e.fullName = n;
      continue;
    }
    (i === "firstname" || i === "fname" || i === "givenname") && (r = n), (i === "lastname" || i === "lname" || i === "surname" || i === "familyname") && (a = n);
  }
  return !e.fullName.trim() && (r || a) && (e.fullName = [r, a].filter(Boolean).join(" ").trim()), e;
}
const L = "http://localhost:8000";
function g() {
  var t;
  (t = chrome.sidePanel) != null && t.setOptions && (chrome.sidePanel.setOptions({ path: "page-sidebar.html" }), chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: !1 }).catch(() => {
  }));
}
g();
chrome.action.onClicked.addListener((t) => {
  t.id != null && chrome.tabs.sendMessage(t.id, { type: "KIWIJOB_TOGGLE_UI" }).catch(() => {
  });
});
const w = "kiwijob-fill-application-form";
function P(t) {
  const o = k;
  if (!t || typeof t != "object") return { ...o };
  const e = t, r = (a) => (typeof e[a] == "string" ? e[a] : "") || "";
  return {
    fullName: r("fullName"),
    email: r("email"),
    phone: r("phone"),
    linkedInUrl: r("linkedInUrl"),
    portfolioUrl: r("portfolioUrl"),
    githubUrl: r("githubUrl"),
    city: r("city"),
    country: r("country"),
    workAuthorization: r("workAuthorization"),
    sponsorship: r("sponsorship"),
    salaryExpectation: r("salaryExpectation"),
    noticePeriod: r("noticePeriod"),
    skills: r("skills"),
    summary: r("summary"),
    coverLetter: r("coverLetter")
  };
}
function v(t) {
  if (!t || typeof t != "object") return d;
  const o = t;
  return {
    ...d,
    ...o,
    fields: { ...d.fields, ...o.fields || {} }
  };
}
async function A() {
  const t = await chrome.storage.sync.get(["autofillSettings"]);
  return v(t.autofillSettings);
}
async function I(t) {
  const o = await l();
  let e = { ...k };
  try {
    const a = await fetch(`${o}/me/applicant-profile`, { method: "GET", headers: await m() });
    a.ok && (e = P(await a.json()));
  } catch {
  }
  let r = [];
  try {
    r = await chrome.cookies.getAll({ url: t });
  } catch {
    r = [];
  }
  return b(e, r);
}
function E(t) {
  return !t || t.startsWith("chrome://") || t.startsWith("edge://") || t.startsWith("about:") || t.startsWith("devtools:") || t.startsWith("chrome-extension://") ? !1 : t.startsWith("http://") || t.startsWith("https://");
}
async function S() {
  const o = (await chrome.tabs.query({ active: !0, currentWindow: !0 }))[0], e = o == null ? void 0 : o.id, r = o == null ? void 0 : o.url;
  if (typeof e != "number" || !r || !E(r))
    return { filled: [], skippedEmpty: ["active tab"] };
  const a = await I(r), c = await A();
  try {
    return await chrome.tabs.sendMessage(e, { type: "AUTOFILL_TAB", profile: a, settings: c });
  } catch {
    return { filled: [], skippedEmpty: ["page script"] };
  }
}
function _() {
  chrome.contextMenus && chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: w,
      title: "Fill form with KiwiJob profile",
      contexts: ["page", "frame", "editable"]
    });
  });
}
chrome.runtime.onInstalled.addListener(() => {
  _(), g();
});
var p;
(p = chrome.contextMenus) == null || p.onClicked.addListener((t, o) => {
  t.menuItemId !== w || typeof (o == null ? void 0 : o.id) != "number" || !o.url || E(o.url) && (async () => {
    const e = await I(o.url), r = await A();
    try {
      await chrome.tabs.sendMessage(o.id, { type: "AUTOFILL_TAB", profile: e, settings: r });
    } catch {
    }
  })();
});
var y;
(y = chrome.commands) == null || y.onCommand.addListener((t) => {
  t === "kiwijob-autofill" && S();
});
async function f(t) {
  const o = await t.text();
  try {
    const r = JSON.parse(o).detail;
    if (typeof r == "string") return r;
    if (Array.isArray(r))
      return r.map((a) => a && typeof a == "object" && "msg" in a ? String(a.msg) : String(a)).join("; ");
  } catch {
  }
  return o.slice(0, 800);
}
async function l() {
  const t = await chrome.storage.sync.get(["apiBase"]);
  return typeof t.apiBase == "string" && t.apiBase.length ? t.apiBase.replace(/\/$/, "") : L;
}
async function m() {
  const t = await chrome.storage.sync.get(["mockUserId"]), o = {}, e = typeof t.mockUserId == "string" ? t.mockUserId.trim() : "";
  return e && !/https?:\/\//i.test(e) && /^\d+$/.test(e) && (o["X-Mock-User-Id"] = e), o;
}
async function h() {
  return { "Content-Type": "application/json", ...await m() };
}
chrome.runtime.onMessage.addListener((t, o, e) => ((async () => {
  var r;
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
      let c;
      try {
        c = await fetch(`${a}/jobs/save`, {
          method: "POST",
          headers: await h(),
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
      if (!c.ok) {
        e({ ok: !1, error: await f(c) });
        return;
      }
      const n = await c.json();
      await chrome.storage.local.set({ lastApplicationId: n.id }), e({ ok: !0, data: n });
      return;
    }
    if (t.type === "TRACK_EVENT") {
      const a = await l();
      let c;
      try {
        c = await fetch(`${a}/events/track`, {
          method: "POST",
          headers: await h(),
          body: JSON.stringify(t.payload)
        });
      } catch (s) {
        const u = s instanceof Error ? s.message : String(s);
        e({
          ok: !1,
          error: u.includes("Failed to fetch") || u.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend and check ${a}/health.` : u
        });
        return;
      }
      if (!c.ok) {
        e({ ok: !1, error: await f(c) });
        return;
      }
      const n = await c.json(), i = (r = n.application) == null ? void 0 : r.id;
      typeof i == "number" && await chrome.storage.local.set({ lastApplicationId: i }), e({ ok: !0, data: n });
      return;
    }
    if (t.type === "ANALYZE_MATCH") {
      const a = await l();
      let c;
      try {
        c = await fetch(`${a}/match/analyze`, {
          method: "POST",
          headers: await h(),
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
      if (!c.ok) {
        e({ ok: !1, error: await f(c) });
        return;
      }
      const n = await c.json();
      e({ ok: !0, data: n });
      return;
    }
    if (t.type === "GET_INSIGHTS") {
      const a = await l();
      let c;
      try {
        const n = Math.max(1, Math.min(365, Number(t.days) || 7)), i = new URLSearchParams({ days: String(n) });
        t.start && i.set("start", t.start), t.end && i.set("end", t.end), c = await fetch(`${a}/analytics/insights?${i.toString()}`, {
          method: "GET",
          headers: await m()
        });
      } catch (n) {
        const i = n instanceof Error ? n.message : String(n);
        e({
          ok: !1,
          error: i.includes("Failed to fetch") || i.includes("NetworkError") ? `Cannot reach API at ${a}. Start the backend and check ${a}/health.` : i
        });
        return;
      }
      if (!c.ok) {
        e({ ok: !1, error: await f(c) });
        return;
      }
      e({ ok: !0, data: await c.json() });
      return;
    }
    e({ ok: !1, error: "Unknown message" });
  } catch (a) {
    e({ ok: !1, error: a.message });
  }
})(), !0));

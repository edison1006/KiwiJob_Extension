const h = {
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
}, l = {
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
function U(t) {
  const n = t.trim();
  if (!n) return "";
  try {
    return decodeURIComponent(n.replace(/\+/g, " "));
  } catch {
    return n;
  }
}
function L(t) {
  return t.toLowerCase().replace(/[-_]/g, "");
}
function T(t, n) {
  const e = { ...t };
  let i = "", o = "";
  for (const s of n) {
    const a = U(s.value || "");
    if (!a) continue;
    const r = L(s.name);
    if (!e.email && (r === "email" || r.endsWith("email") || r === "useremail")) {
      a.includes("@") && (e.email = a);
      continue;
    }
    if (!e.phone && (r.includes("phone") || r.includes("mobile") || r.includes("cell") || r === "tel")) {
      e.phone = a;
      continue;
    }
    if (!e.linkedInUrl && (r.includes("linkedin") || r === "inurl")) {
      (a.includes("linkedin") || a.startsWith("http")) && (e.linkedInUrl = a);
      continue;
    }
    if (!e.portfolioUrl && (r.includes("website") || r.includes("portfolio") || r === "url" || r === "homepage")) {
      a.startsWith("http") && (e.portfolioUrl = a);
      continue;
    }
    if (!e.city && r.includes("city") && !r.includes("company")) {
      e.city = a;
      continue;
    }
    if (!e.country && (r.includes("country") || r === "nation")) {
      e.country = a;
      continue;
    }
    if (!e.fullName && (r === "name" || r === "fullname" || r === "displayname")) {
      e.fullName = a;
      continue;
    }
    (r === "firstname" || r === "fname" || r === "givenname") && (i = a), (r === "lastname" || r === "lname" || r === "surname" || r === "familyname") && (o = a);
  }
  return !e.fullName.trim() && (i || o) && (e.fullName = [i, o].filter(Boolean).join(" ").trim()), e;
}
const b = "http://localhost:8000";
function p() {
  var t;
  (t = chrome.sidePanel) != null && t.setOptions && (chrome.sidePanel.setOptions({ path: "page-sidebar.html" }), chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: !1 }).catch(() => {
  }));
}
p();
chrome.action.onClicked.addListener((t) => {
  t.id != null && chrome.tabs.sendMessage(t.id, { type: "KIWIJOB_TOGGLE_UI" }).catch(() => {
  });
});
const y = "kiwijob-fill-application-form";
function v(t) {
  const n = h;
  if (!t || typeof t != "object") return { ...n };
  const e = t, i = (o) => (typeof e[o] == "string" ? e[o] : "") || "";
  return {
    fullName: i("fullName"),
    email: i("email"),
    phone: i("phone"),
    linkedInUrl: i("linkedInUrl"),
    portfolioUrl: i("portfolioUrl"),
    githubUrl: i("githubUrl"),
    city: i("city"),
    country: i("country"),
    workAuthorization: i("workAuthorization"),
    sponsorship: i("sponsorship"),
    salaryExpectation: i("salaryExpectation"),
    noticePeriod: i("noticePeriod"),
    skills: i("skills"),
    summary: i("summary"),
    coverLetter: i("coverLetter")
  };
}
function E(t) {
  if (!t || typeof t != "object") return l;
  const n = t;
  return {
    ...l,
    ...n,
    fields: { ...l.fields, ...n.fields || {} }
  };
}
async function k() {
  const t = await chrome.storage.sync.get(["autofillSettings"]);
  return E(t.autofillSettings);
}
async function g(t) {
  const n = await c();
  let e = { ...h };
  try {
    const o = await fetch(`${n}/me/applicant-profile`, { method: "GET", headers: await I() });
    o.ok && (e = v(await o.json()));
  } catch {
  }
  let i = [];
  try {
    i = await chrome.cookies.getAll({ url: t });
  } catch {
    i = [];
  }
  return T(e, i);
}
function w(t) {
  return !t || t.startsWith("chrome://") || t.startsWith("edge://") || t.startsWith("about:") || t.startsWith("devtools:") || t.startsWith("chrome-extension://") ? !1 : t.startsWith("http://") || t.startsWith("https://");
}
async function A() {
  const n = (await chrome.tabs.query({ active: !0, currentWindow: !0 }))[0], e = n == null ? void 0 : n.id, i = n == null ? void 0 : n.url;
  if (typeof e != "number" || !i || !w(i))
    return { filled: [], skippedEmpty: ["active tab"] };
  const o = await g(i), s = await k();
  try {
    return await chrome.tabs.sendMessage(e, { type: "AUTOFILL_TAB", profile: o, settings: s });
  } catch {
    return { filled: [], skippedEmpty: ["page script"] };
  }
}
function P() {
  chrome.contextMenus && chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: y,
      title: "Fill form with KiwiJob profile",
      contexts: ["page", "frame", "editable"]
    });
  });
}
chrome.runtime.onInstalled.addListener(() => {
  P(), p();
});
var d;
(d = chrome.contextMenus) == null || d.onClicked.addListener((t, n) => {
  t.menuItemId !== y || typeof (n == null ? void 0 : n.id) != "number" || !n.url || w(n.url) && (async () => {
    const e = await g(n.url), i = await k();
    try {
      await chrome.tabs.sendMessage(n.id, { type: "AUTOFILL_TAB", profile: e, settings: i });
    } catch {
    }
  })();
});
var m;
(m = chrome.commands) == null || m.onCommand.addListener((t) => {
  t === "kiwijob-autofill" && A();
});
async function u(t) {
  const n = await t.text();
  try {
    const i = JSON.parse(n).detail;
    if (typeof i == "string") return i;
    if (Array.isArray(i))
      return i.map((o) => o && typeof o == "object" && "msg" in o ? String(o.msg) : String(o)).join("; ");
  } catch {
  }
  return n.slice(0, 800);
}
async function c() {
  const t = await chrome.storage.sync.get(["apiBase"]);
  return typeof t.apiBase == "string" && t.apiBase.length ? t.apiBase.replace(/\/$/, "") : b;
}
async function I() {
  const t = await chrome.storage.sync.get(["mockUserId"]), n = {}, e = typeof t.mockUserId == "string" ? t.mockUserId.trim() : "";
  return e && !/https?:\/\//i.test(e) && /^\d+$/.test(e) && (n["X-Mock-User-Id"] = e), n;
}
async function f() {
  return { "Content-Type": "application/json", ...await I() };
}
chrome.runtime.onMessage.addListener((t, n, e) => ((async () => {
  try {
    if (t.type === "GET_API_BASE") {
      e({ ok: !0, data: await c() });
      return;
    }
    if (t.type === "SET_API_BASE") {
      await chrome.storage.sync.set({ apiBase: t.apiBase }), e({ ok: !0, data: await c() });
      return;
    }
    if (t.type === "AUTOFILL_ACTIVE_TAB") {
      e({ ok: !0, data: await A() });
      return;
    }
    if (t.type === "SAVE_JOB") {
      const i = await c();
      let o;
      try {
        o = await fetch(`${i}/jobs/save`, {
          method: "POST",
          headers: await f(),
          body: JSON.stringify(t.payload)
        });
      } catch (a) {
        const r = a instanceof Error ? a.message : String(a);
        e({
          ok: !1,
          error: r.includes("Failed to fetch") || r.includes("NetworkError") ? `Cannot reach API at ${i}. Start the backend (uvicorn) and open ${i}/health in a tab to verify.` : r
        });
        return;
      }
      if (!o.ok) {
        e({ ok: !1, error: await u(o) });
        return;
      }
      const s = await o.json();
      await chrome.storage.local.set({ lastApplicationId: s.id }), e({ ok: !0, data: s });
      return;
    }
    if (t.type === "ANALYZE_MATCH") {
      const i = await c();
      let o;
      try {
        o = await fetch(`${i}/match/analyze`, {
          method: "POST",
          headers: await f(),
          body: JSON.stringify({ job_id: t.jobId })
        });
      } catch (a) {
        const r = a instanceof Error ? a.message : String(a);
        e({
          ok: !1,
          error: r.includes("Failed to fetch") || r.includes("NetworkError") ? `Cannot reach API at ${i}. Start the backend and check ${i}/health.` : r
        });
        return;
      }
      if (!o.ok) {
        e({ ok: !1, error: await u(o) });
        return;
      }
      const s = await o.json();
      e({ ok: !0, data: s });
      return;
    }
    e({ ok: !1, error: "Unknown message" });
  } catch (i) {
    e({ ok: !1, error: i.message });
  }
})(), !0));

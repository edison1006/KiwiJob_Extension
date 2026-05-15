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
function U(t, c) {
  const e = { ...t };
  let o = "", i = "";
  for (const n of c) {
    const a = b(n.value || "");
    if (!a) continue;
    const r = T(n.name);
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
    (r === "firstname" || r === "fname" || r === "givenname") && (o = a), (r === "lastname" || r === "lname" || r === "surname" || r === "familyname") && (i = a);
  }
  return !e.fullName.trim() && (o || i) && (e.fullName = [o, i].filter(Boolean).join(" ").trim()), e;
}
const $ = "http://localhost:8000";
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
function P(t) {
  const c = y;
  if (!t || typeof t != "object") return { ...c };
  const e = t, o = (i) => (typeof e[i] == "string" ? e[i] : "") || "";
  return {
    fullName: o("fullName"),
    email: o("email"),
    phone: o("phone"),
    linkedInUrl: o("linkedInUrl"),
    portfolioUrl: o("portfolioUrl"),
    githubUrl: o("githubUrl"),
    city: o("city"),
    country: o("country"),
    workAuthorization: o("workAuthorization"),
    sponsorship: o("sponsorship"),
    salaryExpectation: o("salaryExpectation"),
    noticePeriod: o("noticePeriod"),
    skills: o("skills"),
    summary: o("summary"),
    coverLetter: o("coverLetter")
  };
}
function L(t) {
  var c, e;
  return t != null && t.upload ? {
    fullName: t.full_name || "",
    email: t.email || "",
    phone: t.phone || "",
    skills: t.skills.join(", "),
    linkedInUrl: t.links.find((o) => /linkedin/i.test(o)) || "",
    portfolioUrl: t.links.find((o) => !/linkedin|github/i.test(o)) || "",
    githubUrl: t.links.find((o) => /github/i.test(o)) || "",
    summary: [
      (c = t.experience[0]) != null && c.title ? `Most recent role: ${t.experience[0].title}` : "",
      (e = t.education[0]) != null && e.school ? `Education: ${t.education[0].school}` : ""
    ].filter(Boolean).join(`
`)
  } : {};
}
function _(t) {
  if (!t || typeof t != "object") return d;
  const c = t;
  return {
    ...d,
    ...c,
    fields: { ...d.fields, ...c.fields || {} }
  };
}
async function I() {
  const t = await chrome.storage.sync.get(["autofillSettings"]);
  return _(t.autofillSettings);
}
async function A(t) {
  const c = await l();
  let e = { ...y };
  try {
    const i = await fetch(`${c}/me/applicant-profile`, { method: "GET", headers: await u() });
    i.ok && (e = P(await i.json()));
  } catch {
  }
  try {
    const i = await chrome.storage.local.get(["selectedResumeId"]), n = typeof i.selectedResumeId == "number" ? i.selectedResumeId : void 0, a = n ? `/resumes/${n}/profile` : "/resumes/profile", r = await fetch(`${c}${a}`, { method: "GET", headers: await u() });
    r.ok && (e = { ...e, ...L(await r.json()) });
  } catch {
  }
  let o = [];
  try {
    o = await chrome.cookies.getAll({ url: t });
  } catch {
    o = [];
  }
  return U(e, o);
}
function E(t) {
  return !t || t.startsWith("chrome://") || t.startsWith("edge://") || t.startsWith("about:") || t.startsWith("devtools:") || t.startsWith("chrome-extension://") ? !1 : t.startsWith("http://") || t.startsWith("https://");
}
async function S() {
  const c = (await chrome.tabs.query({ active: !0, currentWindow: !0 }))[0], e = c == null ? void 0 : c.id, o = c == null ? void 0 : c.url;
  if (typeof e != "number" || !o || !E(o))
    return { filled: [], skippedEmpty: ["active tab"] };
  const i = await A(o), n = await I();
  try {
    return await chrome.tabs.sendMessage(e, { type: "AUTOFILL_TAB", profile: i, settings: n });
  } catch (a) {
    const r = a instanceof Error ? a.message : String(a);
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
  t.menuItemId !== g || typeof (c == null ? void 0 : c.id) != "number" || !c.url || E(c.url) && (async () => {
    const e = await A(c.url), o = await I();
    try {
      await chrome.tabs.sendMessage(c.id, { type: "AUTOFILL_TAB", profile: e, settings: o });
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
    const o = JSON.parse(c).detail;
    if (typeof o == "string") return o;
    if (Array.isArray(o))
      return o.map((i) => i && typeof i == "object" && "msg" in i ? String(i.msg) : String(i)).join("; ");
  } catch {
  }
  return c.slice(0, 800);
}
async function l() {
  const t = await chrome.storage.sync.get(["apiBase"]);
  return typeof t.apiBase == "string" && t.apiBase.length ? t.apiBase.replace(/\/$/, "") : $;
}
async function u() {
  const t = await chrome.storage.sync.get(["mockUserId"]), c = {}, e = typeof t.mockUserId == "string" ? t.mockUserId.trim() : "";
  return e && !/https?:\/\//i.test(e) && /^\d+$/.test(e) && (c["X-Mock-User-Id"] = e), c;
}
async function m() {
  return { "Content-Type": "application/json", ...await u() };
}
chrome.runtime.onMessage.addListener((t, c, e) => ((async () => {
  var o;
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
      const i = await l();
      let n;
      try {
        n = await fetch(`${i}/jobs/save`, {
          method: "POST",
          headers: await m(),
          body: JSON.stringify(t.payload)
        });
      } catch (r) {
        const s = r instanceof Error ? r.message : String(r);
        e({
          ok: !1,
          error: s.includes("Failed to fetch") || s.includes("NetworkError") ? `Cannot reach API at ${i}. Start the backend (uvicorn) and open ${i}/health in a tab to verify.` : s
        });
        return;
      }
      if (!n.ok) {
        e({ ok: !1, error: await f(n) });
        return;
      }
      const a = await n.json();
      await chrome.storage.local.set({ lastApplicationId: a.id }), e({ ok: !0, data: a });
      return;
    }
    if (t.type === "TRACK_EVENT") {
      const i = await l();
      let n;
      try {
        n = await fetch(`${i}/events/track`, {
          method: "POST",
          headers: await m(),
          body: JSON.stringify(t.payload)
        });
      } catch (s) {
        const h = s instanceof Error ? s.message : String(s);
        e({
          ok: !1,
          error: h.includes("Failed to fetch") || h.includes("NetworkError") ? `Cannot reach API at ${i}. Start the backend and check ${i}/health.` : h
        });
        return;
      }
      if (!n.ok) {
        e({ ok: !1, error: await f(n) });
        return;
      }
      const a = await n.json(), r = (o = a.application) == null ? void 0 : o.id;
      typeof r == "number" && await chrome.storage.local.set({ lastApplicationId: r }), e({ ok: !0, data: a });
      return;
    }
    if (t.type === "ANALYZE_MATCH") {
      const i = await l();
      let n;
      try {
        n = await fetch(`${i}/match/analyze`, {
          method: "POST",
          headers: await m(),
          body: JSON.stringify({ job_id: t.jobId })
        });
      } catch (r) {
        const s = r instanceof Error ? r.message : String(r);
        e({
          ok: !1,
          error: s.includes("Failed to fetch") || s.includes("NetworkError") ? `Cannot reach API at ${i}. Start the backend and check ${i}/health.` : s
        });
        return;
      }
      if (!n.ok) {
        e({ ok: !1, error: await f(n) });
        return;
      }
      const a = await n.json();
      e({ ok: !0, data: a });
      return;
    }
    if (t.type === "GET_MATCH") {
      const i = await l();
      let n;
      try {
        n = await fetch(`${i}/match/${t.jobId}`, {
          method: "GET",
          headers: await u()
        });
      } catch (r) {
        const s = r instanceof Error ? r.message : String(r);
        e({
          ok: !1,
          error: s.includes("Failed to fetch") || s.includes("NetworkError") ? `Cannot reach API at ${i}. Start the backend and check ${i}/health.` : s
        });
        return;
      }
      if (!n.ok) {
        e({ ok: !1, error: await f(n) });
        return;
      }
      const a = await n.json();
      e({ ok: !0, data: a });
      return;
    }
    if (t.type === "GET_INSIGHTS") {
      const i = await l();
      let n;
      try {
        const a = Math.max(1, Math.min(365, Number(t.days) || 7)), r = new URLSearchParams({ days: String(a) });
        t.start && r.set("start", t.start), t.end && r.set("end", t.end), n = await fetch(`${i}/analytics/insights?${r.toString()}`, {
          method: "GET",
          headers: await u()
        });
      } catch (a) {
        const r = a instanceof Error ? a.message : String(a);
        e({
          ok: !1,
          error: r.includes("Failed to fetch") || r.includes("NetworkError") ? `Cannot reach API at ${i}. Start the backend and check ${i}/health.` : r
        });
        return;
      }
      if (!n.ok) {
        e({ ok: !1, error: await f(n) });
        return;
      }
      e({ ok: !0, data: await n.json() });
      return;
    }
    if (t.type === "GET_CV_PROFILE") {
      const i = await l();
      let n;
      try {
        const a = typeof t.resumeId == "number" ? `/resumes/${t.resumeId}/profile` : "/resumes/profile";
        n = await fetch(`${i}${a}`, {
          method: "GET",
          headers: await u()
        });
      } catch (a) {
        const r = a instanceof Error ? a.message : String(a);
        e({
          ok: !1,
          error: r.includes("Failed to fetch") || r.includes("NetworkError") ? `Cannot reach API at ${i}. Start the backend and check ${i}/health.` : r
        });
        return;
      }
      if (!n.ok) {
        e({ ok: !1, error: await f(n) });
        return;
      }
      e({ ok: !0, data: await n.json() });
      return;
    }
    if (t.type === "GET_RESUMES") {
      const i = await l();
      let n;
      try {
        n = await fetch(`${i}/resumes`, {
          method: "GET",
          headers: await u()
        });
      } catch (a) {
        const r = a instanceof Error ? a.message : String(a);
        e({
          ok: !1,
          error: r.includes("Failed to fetch") || r.includes("NetworkError") ? `Cannot reach API at ${i}. Start the backend and check ${i}/health.` : r
        });
        return;
      }
      if (!n.ok) {
        e({ ok: !1, error: await f(n) });
        return;
      }
      e({ ok: !0, data: await n.json() });
      return;
    }
    e({ ok: !1, error: "Unknown message" });
  } catch (i) {
    e({ ok: !1, error: i.message });
  }
})(), !0));

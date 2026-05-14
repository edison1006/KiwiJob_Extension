const m = {
  fullName: "",
  email: "",
  phone: "",
  linkedInUrl: "",
  portfolioUrl: "",
  city: "",
  country: ""
};
function w(t) {
  const r = t.trim();
  if (!r) return "";
  try {
    return decodeURIComponent(r.replace(/\+/g, " "));
  } catch {
    return r;
  }
}
function A(t) {
  return t.toLowerCase().replace(/[-_]/g, "");
}
function I(t, r) {
  const e = { ...t };
  let i = "", o = "";
  for (const c of r) {
    const a = w(c.value || "");
    if (!a) continue;
    const n = A(c.name);
    if (!e.email && (n === "email" || n.endsWith("email") || n === "useremail")) {
      a.includes("@") && (e.email = a);
      continue;
    }
    if (!e.phone && (n.includes("phone") || n.includes("mobile") || n.includes("cell") || n === "tel")) {
      e.phone = a;
      continue;
    }
    if (!e.linkedInUrl && (n.includes("linkedin") || n === "inurl")) {
      (a.includes("linkedin") || a.startsWith("http")) && (e.linkedInUrl = a);
      continue;
    }
    if (!e.portfolioUrl && (n.includes("website") || n.includes("portfolio") || n === "url" || n === "homepage")) {
      a.startsWith("http") && (e.portfolioUrl = a);
      continue;
    }
    if (!e.city && n.includes("city") && !n.includes("company")) {
      e.city = a;
      continue;
    }
    if (!e.country && (n.includes("country") || n === "nation")) {
      e.country = a;
      continue;
    }
    if (!e.fullName && (n === "name" || n === "fullname" || n === "displayname")) {
      e.fullName = a;
      continue;
    }
    (n === "firstname" || n === "fname" || n === "givenname") && (i = a), (n === "lastname" || n === "lname" || n === "surname" || n === "familyname") && (o = a);
  }
  return !e.fullName.trim() && (i || o) && (e.fullName = [i, o].filter(Boolean).join(" ").trim()), e;
}
const U = "http://localhost:8000";
function h() {
  var t;
  (t = chrome.sidePanel) != null && t.setOptions && (chrome.sidePanel.setOptions({ path: "page-sidebar.html" }), chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: !1 }).catch(() => {
  }));
}
h();
chrome.action.onClicked.addListener((t) => {
  t.id != null && chrome.tabs.sendMessage(t.id, { type: "EASYJOB_TOGGLE_UI" }).catch(() => {
  });
});
const p = "easyjob-fill-application-form";
function P(t) {
  const r = m;
  if (!t || typeof t != "object") return { ...r };
  const e = t, i = (o) => (typeof e[o] == "string" ? e[o] : "") || "";
  return {
    fullName: i("fullName"),
    email: i("email"),
    phone: i("phone"),
    linkedInUrl: i("linkedInUrl"),
    portfolioUrl: i("portfolioUrl"),
    city: i("city"),
    country: i("country")
  };
}
async function y(t) {
  const r = await s();
  let e = { ...m };
  try {
    const o = await fetch(`${r}/me/applicant-profile`, { method: "GET", headers: await g() });
    o.ok && (e = P(await o.json()));
  } catch {
  }
  let i = [];
  try {
    i = await chrome.cookies.getAll({ url: t });
  } catch {
    i = [];
  }
  return I(e, i);
}
function k(t) {
  return !t || t.startsWith("chrome://") || t.startsWith("edge://") || t.startsWith("about:") || t.startsWith("devtools:") || t.startsWith("chrome-extension://") ? !1 : t.startsWith("http://") || t.startsWith("https://");
}
async function b() {
  const r = (await chrome.tabs.query({ active: !0, currentWindow: !0 }))[0], e = r == null ? void 0 : r.id, i = r == null ? void 0 : r.url;
  if (typeof e != "number" || !i || !k(i))
    return;
  const o = await y(i);
  try {
    await chrome.tabs.sendMessage(e, { type: "AUTOFILL_TAB", profile: o });
  } catch {
  }
}
function v() {
  chrome.contextMenus && chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: p,
      title: "Fill form with EasyJob profile",
      contexts: ["page", "frame", "editable"]
    });
  });
}
chrome.runtime.onInstalled.addListener(() => {
  v(), h();
});
var u;
(u = chrome.contextMenus) == null || u.onClicked.addListener((t, r) => {
  t.menuItemId !== p || typeof (r == null ? void 0 : r.id) != "number" || !r.url || k(r.url) && (async () => {
    const e = await y(r.url);
    try {
      await chrome.tabs.sendMessage(r.id, { type: "AUTOFILL_TAB", profile: e });
    } catch {
    }
  })();
});
var d;
(d = chrome.commands) == null || d.onCommand.addListener((t) => {
  t === "easyjob-autofill" && b();
});
async function l(t) {
  const r = await t.text();
  try {
    const i = JSON.parse(r).detail;
    if (typeof i == "string") return i;
    if (Array.isArray(i))
      return i.map((o) => o && typeof o == "object" && "msg" in o ? String(o.msg) : String(o)).join("; ");
  } catch {
  }
  return r.slice(0, 800);
}
async function s() {
  const t = await chrome.storage.sync.get(["apiBase"]);
  return typeof t.apiBase == "string" && t.apiBase.length ? t.apiBase.replace(/\/$/, "") : U;
}
async function g() {
  const t = await chrome.storage.sync.get(["mockUserId"]), r = {}, e = typeof t.mockUserId == "string" ? t.mockUserId.trim() : "";
  return e && !/https?:\/\//i.test(e) && /^\d+$/.test(e) && (r["X-Mock-User-Id"] = e), r;
}
async function f() {
  return { "Content-Type": "application/json", ...await g() };
}
chrome.runtime.onMessage.addListener((t, r, e) => ((async () => {
  try {
    if (t.type === "GET_API_BASE") {
      e({ ok: !0, data: await s() });
      return;
    }
    if (t.type === "SET_API_BASE") {
      await chrome.storage.sync.set({ apiBase: t.apiBase }), e({ ok: !0, data: await s() });
      return;
    }
    if (t.type === "SAVE_JOB") {
      const i = await s();
      let o;
      try {
        o = await fetch(`${i}/jobs/save`, {
          method: "POST",
          headers: await f(),
          body: JSON.stringify(t.payload)
        });
      } catch (a) {
        const n = a instanceof Error ? a.message : String(a);
        e({
          ok: !1,
          error: n.includes("Failed to fetch") || n.includes("NetworkError") ? `Cannot reach API at ${i}. Start the backend (uvicorn) and open ${i}/health in a tab to verify.` : n
        });
        return;
      }
      if (!o.ok) {
        e({ ok: !1, error: await l(o) });
        return;
      }
      const c = await o.json();
      await chrome.storage.local.set({ lastApplicationId: c.id }), e({ ok: !0, data: c });
      return;
    }
    if (t.type === "ANALYZE_MATCH") {
      const i = await s();
      let o;
      try {
        o = await fetch(`${i}/match/analyze`, {
          method: "POST",
          headers: await f(),
          body: JSON.stringify({ job_id: t.jobId })
        });
      } catch (a) {
        const n = a instanceof Error ? a.message : String(a);
        e({
          ok: !1,
          error: n.includes("Failed to fetch") || n.includes("NetworkError") ? `Cannot reach API at ${i}. Start the backend and check ${i}/health.` : n
        });
        return;
      }
      if (!o.ok) {
        e({ ok: !1, error: await l(o) });
        return;
      }
      const c = await o.json();
      e({ ok: !0, data: c });
      return;
    }
    e({ ok: !1, error: "Unknown message" });
  } catch (i) {
    e({ ok: !1, error: i.message });
  }
})(), !0));

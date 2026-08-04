//#region src/background.ts
var e = "https://api.kiwijob.co.nz", t = /* @__PURE__ */ "seek.co.nz,seek.com.au,seek.com,linkedin.com,trademe.co.nz,indeed.com,indeed.co.nz,nz.jora.com,jobs.govt.nz,careers.govt.nz,studentjobsearch.co.nz,sjs.co.nz,myjobspace.co.nz,job.co.nz,kiwihealthjobs.com,maoripacificjobs.co.nz,workingin-newzealand.com,workingin.com,talent.com,careerjet.co.nz,adzuna.co.nz,jobted.co.nz,recruit.net,glassdoor.co.nz,whatjobs.com,grabjobs.co,workhere.co.nz,seasonaljobs.co.nz,backpackerboard.co.nz,boards.greenhouse.io,job-boards.greenhouse.io,jobs.lever.co,myworkdayjobs.com,smartrecruiters.com,ashbyhq.com,workable.com,bamboohr.com,breezy.hr,jobvite.com,recruitee.com,successfactors.com,jobs2web.com,oraclecloud.com,taleo.net".split(","), n = null;
function r(t) {
	let n = t.trim().replace(/\/+$/, "");
	return !n || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(n) ? e : n;
}
function i(e) {
	if (!e) return !1;
	try {
		let n = new URL(e);
		if (n.protocol !== "http:" && n.protocol !== "https:") return !1;
		let r = n.hostname.replace(/^www\./i, "").toLowerCase();
		return t.some((e) => r === e || r.endsWith(`.${e}`));
	} catch {
		return !1;
	}
}
function a(e) {
	return typeof e.id != "number" || !i(e.url) ? null : (n = {
		id: e.id,
		url: e.url
	}, n);
}
async function o(e) {
	let t = await chrome.tabs.query(e);
	for (let e of t) {
		let t = a(e);
		if (t) return t;
	}
	return null;
}
async function s() {
	return await o({
		active: !0,
		currentWindow: !0
	}) || await o({
		active: !0,
		lastFocusedWindow: !0
	}) || n;
}
function c() {
	chrome.sidePanel?.setOptions && (chrome.sidePanel.setOptions({ path: "page-sidebar.html" }), chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: !0 }).catch(() => {}));
}
c(), chrome.action.onClicked.addListener((e) => {
	e.id != null && chrome.tabs.sendMessage(e.id, { type: "KIWIJOB_TOGGLE_UI" }).catch(() => {});
}), chrome.runtime.onInstalled.addListener(() => {
	c();
}), chrome.tabs.onActivated.addListener(({ tabId: e }) => {
	chrome.tabs.get(e).then((e) => {
		a(e);
	}).catch(() => {});
}), chrome.tabs.onUpdated.addListener((e, t, n) => {
	(t.status === "complete" || t.url) && a(n);
});
async function l(e) {
	let t = await e.text();
	try {
		let e = JSON.parse(t).detail;
		if (typeof e == "string") return e;
		if (Array.isArray(e)) return e.map((e) => e && typeof e == "object" && "msg" in e ? String(e.msg) : String(e)).join("; ");
	} catch {}
	return t.slice(0, 800);
}
async function u() {
	let t = await chrome.storage.sync.get(["apiBase"]), n = typeof t.apiBase == "string" ? r(t.apiBase) : e;
	return n !== t.apiBase && await chrome.storage.sync.set({ apiBase: n }), n;
}
async function d() {
	let e = await u(), t = new AbortController(), n = setTimeout(() => t.abort(), 5e3);
	try {
		let n = await fetch(`${e}/health`, {
			method: "GET",
			signal: t.signal
		});
		return {
			reachable: n.ok,
			api: e,
			error: n.ok ? void 0 : `HTTP ${n.status}`
		};
	} catch (t) {
		return {
			reachable: !1,
			api: e,
			error: t instanceof Error ? t.message : String(t)
		};
	} finally {
		clearTimeout(n);
	}
}
async function f() {
	let e = await chrome.storage.sync.get(["authToken", "authUser"]);
	return {
		token: typeof e.authToken == "string" ? e.authToken.trim() : "",
		user: e.authUser && typeof e.authUser == "object" && typeof e.authUser.email == "string" ? e.authUser : null
	};
}
async function p() {
	let { token: e } = await f(), t = {};
	return e && (t.Authorization = `Bearer ${e}`), t;
}
async function m() {
	return {
		"Content-Type": "application/json",
		...await p()
	};
}
async function h(e) {
	let t = e;
	if (typeof t.access_token != "string" || !t.user || typeof t.user != "object") throw Error("Invalid auth response");
	return await chrome.storage.sync.set({
		authToken: t.access_token,
		authUser: t.user
	}), t;
}
chrome.runtime.onMessage.addListener((e, t, n) => ((async () => {
	try {
		if (e.type === "GET_API_BASE") {
			n({
				ok: !0,
				data: await u()
			});
			return;
		}
		if (e.type === "GET_ACTIVE_JOB_TAB") {
			n({
				ok: !0,
				data: await s()
			});
			return;
		}
		if (e.type === "API_HEALTH") {
			n({
				ok: !0,
				data: await d()
			});
			return;
		}
		if (e.type === "SET_API_BASE") {
			await chrome.storage.sync.set({ apiBase: e.apiBase }), n({
				ok: !0,
				data: await u()
			});
			return;
		}
		if (e.type === "AUTH_STATE") {
			let e = await u(), t = await f();
			try {
				let r = await fetch(`${e}/auth/me`, {
					method: "GET",
					credentials: "include",
					headers: await p()
				});
				if (r.ok) {
					let e = await r.json();
					await chrome.storage.sync.set({ authUser: e }), n({
						ok: !0,
						data: {
							token: t.token,
							user: e
						}
					});
					return;
				}
				await chrome.storage.sync.remove(["authToken", "authUser"]), n({
					ok: !0,
					data: {
						token: "",
						user: null
					}
				});
			} catch {
				n({
					ok: !0,
					data: t
				});
			}
			return;
		}
		if (e.type === "AUTH_LOGIN" || e.type === "AUTH_REGISTER") {
			let t = await u(), r = e.type === "AUTH_LOGIN" ? "/auth/login" : "/auth/register", i = e.type === "AUTH_LOGIN" ? {
				email: e.email,
				password: e.password
			} : {
				email: e.email,
				password: e.password,
				display_name: e.displayName || ""
			}, a = await fetch(`${t}${r}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(i)
			});
			if (!a.ok) {
				n({
					ok: !1,
					error: await l(a)
				});
				return;
			}
			n({
				ok: !0,
				data: await h(await a.json())
			});
			return;
		}
		if (e.type === "AUTH_LOGOUT") {
			let e = await u();
			try {
				await fetch(`${e}/auth/logout`, {
					method: "POST",
					credentials: "include",
					headers: await p()
				});
			} catch {}
			await chrome.storage.sync.remove(["authToken", "authUser"]), n({
				ok: !0,
				data: {
					token: "",
					user: null
				}
			});
			return;
		}
		if (e.type === "SAVE_JOB") {
			let t = await u(), r;
			try {
				r = await fetch(`${t}/jobs/save`, {
					method: "POST",
					credentials: "include",
					headers: await m(),
					body: JSON.stringify(e.payload)
				});
			} catch (e) {
				let r = e instanceof Error ? e.message : String(e);
				n({
					ok: !1,
					error: r.includes("Failed to fetch") || r.includes("NetworkError") ? `Cannot reach API at ${t}. Start the backend (uvicorn) and open ${t}/health in a tab to verify.` : r
				});
				return;
			}
			if (!r.ok) {
				n({
					ok: !1,
					error: await l(r)
				});
				return;
			}
			let i = await r.json();
			await chrome.storage.local.set({ lastApplicationId: i.id }), n({
				ok: !0,
				data: i
			});
			return;
		}
		if (e.type === "PREVIEW_MATCH") {
			let t = await u(), r;
			try {
				r = await fetch(`${t}/match/preview`, {
					method: "POST",
					credentials: "include",
					headers: await m(),
					body: JSON.stringify(e.payload)
				});
			} catch (e) {
				let r = e instanceof Error ? e.message : String(e);
				n({
					ok: !1,
					error: r.includes("Failed to fetch") || r.includes("NetworkError") ? `Cannot reach API at ${t}. Start the backend and check ${t}/health.` : r
				});
				return;
			}
			if (!r.ok) {
				n({
					ok: !1,
					error: await l(r)
				});
				return;
			}
			n({
				ok: !0,
				data: await r.json()
			});
			return;
		}
		if (e.type === "ANALYZE_MATCH") {
			let t = await u(), r;
			try {
				r = await fetch(`${t}/match/analyze`, {
					method: "POST",
					credentials: "include",
					headers: await m(),
					body: JSON.stringify({ job_id: e.jobId })
				});
			} catch (e) {
				let r = e instanceof Error ? e.message : String(e);
				n({
					ok: !1,
					error: r.includes("Failed to fetch") || r.includes("NetworkError") ? `Cannot reach API at ${t}. Start the backend and check ${t}/health.` : r
				});
				return;
			}
			if (!r.ok) {
				n({
					ok: !1,
					error: await l(r)
				});
				return;
			}
			n({
				ok: !0,
				data: await r.json()
			});
			return;
		}
		if (e.type === "GET_MATCH") {
			let t = await u(), r;
			try {
				r = await fetch(`${t}/match/${e.jobId}`, {
					method: "GET",
					credentials: "include",
					headers: await p()
				});
			} catch (e) {
				let r = e instanceof Error ? e.message : String(e);
				n({
					ok: !1,
					error: r.includes("Failed to fetch") || r.includes("NetworkError") ? `Cannot reach API at ${t}. Start the backend and check ${t}/health.` : r
				});
				return;
			}
			if (!r.ok) {
				n({
					ok: !1,
					error: await l(r)
				});
				return;
			}
			n({
				ok: !0,
				data: await r.json()
			});
			return;
		}
		if (e.type === "GET_INSIGHTS") {
			let t = await u(), r;
			try {
				let n = Math.max(1, Math.min(365, Number(e.days) || 7)), i = new URLSearchParams({ days: String(n) });
				e.start && i.set("start", e.start), e.end && i.set("end", e.end), r = await fetch(`${t}/analytics/insights?${i.toString()}`, {
					method: "GET",
					credentials: "include",
					headers: await p()
				});
			} catch (e) {
				let r = e instanceof Error ? e.message : String(e);
				n({
					ok: !1,
					error: r.includes("Failed to fetch") || r.includes("NetworkError") ? `Cannot reach API at ${t}. Start the backend and check ${t}/health.` : r
				});
				return;
			}
			if (!r.ok) {
				n({
					ok: !1,
					error: await l(r)
				});
				return;
			}
			n({
				ok: !0,
				data: await r.json()
			});
			return;
		}
		if (e.type === "GET_CV_PROFILE") {
			let t = await u(), r;
			try {
				let n = typeof e.resumeId == "number" ? `/resumes/${e.resumeId}/profile` : "/resumes/profile";
				r = await fetch(`${t}${n}`, {
					method: "GET",
					credentials: "include",
					headers: await p()
				});
			} catch (e) {
				let r = e instanceof Error ? e.message : String(e);
				n({
					ok: !1,
					error: r.includes("Failed to fetch") || r.includes("NetworkError") ? `Cannot reach API at ${t}. Start the backend and check ${t}/health.` : r
				});
				return;
			}
			if (!r.ok) {
				n({
					ok: !1,
					error: await l(r)
				});
				return;
			}
			n({
				ok: !0,
				data: await r.json()
			});
			return;
		}
		if (e.type === "GET_RESUMES") {
			let e = await u(), t;
			try {
				t = await fetch(`${e}/resumes`, {
					method: "GET",
					credentials: "include",
					headers: await p()
				});
			} catch (t) {
				let r = t instanceof Error ? t.message : String(t);
				n({
					ok: !1,
					error: r.includes("Failed to fetch") || r.includes("NetworkError") ? `Cannot reach API at ${e}. Start the backend and check ${e}/health.` : r
				});
				return;
			}
			if (!t.ok) {
				n({
					ok: !1,
					error: await l(t)
				});
				return;
			}
			n({
				ok: !0,
				data: await t.json()
			});
			return;
		}
		n({
			ok: !1,
			error: "Unknown message"
		});
	} catch (e) {
		n({
			ok: !1,
			error: e.message
		});
	}
})(), !0));
//#endregion

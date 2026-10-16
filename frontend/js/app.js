"use strict";
// Shared frontend core: auth, API calls, DOM helpers, job cards, dialogs, toasts, polling.
const MF = (() => {
  const KEY = "manfriday.auth";
  const HOME = { CLIENT: "client.html", ASSISTANT: "assistant.html", ADMIN: "admin.html" };
  const ROLE_LABEL = { CLIENT: "Client", ASSISTANT: "Assistant", ADMIN: "Admin" };

  // step: position in the progress tracker; -1 = job stopped (cancelled/rejected)
  const STATUS = {
    PUBLISHED:          { label: "Open",        tone: "info",   step: 0 },
    ASSISTANT_ACCEPTED: { label: "Accepted",    tone: "violet", step: 1 },
    IN_PROGRESS:        { label: "In progress", tone: "warn",   step: 2 },
    COMPLETED:          { label: "Completed",   tone: "ok",     step: 3 },
    REJECTED:           { label: "Rejected",    tone: "muted",  step: -1 },
    CANCELLED:          { label: "Cancelled",   tone: "muted",  step: -1 },
  };
  const STEPS = ["Posted", "Accepted", "In progress", "Done"];

  const CATEGORIES = {
    TV_REPAIR:           { label: "TV repair",           icon: "tv" },
    DOCUMENT_SUBMISSION: { label: "Document submission", icon: "doc" },
    GROCERY_SHOPPING:    { label: "Grocery shopping",    icon: "cart" },
    BILL_PAYMENT:        { label: "Bill payment",        icon: "bill" },
    PARCEL_PICKUP:       { label: "Parcel pickup",       icon: "parcel" },
    OTHER:               { label: "Other",               icon: "other" },
  };

  const ICONS = {
    tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
    doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M3 4h2l2.4 11h11.2L21 7H6.1"/>',
    bill: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/>',
    parcel: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    other: '<circle cx="12" cy="12" r="9"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    helper: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    play: '<path d="M7 5l12 7-12 7z"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1.5 3h5L16 13h5"/>',
    stop: '<circle cx="12" cy="12" r="9"/><path d="M8 8l8 8"/>',
  };

  // ---------- DOM helpers ----------

  function icon(name) {
    const span = document.createElement("span");
    span.className = "icon";
    span.setAttribute("aria-hidden", "true");
    // Static, trusted markup from ICONS only
    span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
    return span;
  }

  // h("div", {class: "x", onClick: fn}, child...) — text children are always inserted as text nodes
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ---------- auth + API ----------

  function load() {
    try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; }
  }

  function save(auth) {
    try { sessionStorage.setItem(KEY, JSON.stringify(auth)); } catch { /* storage unavailable */ }
  }

  function logout() {
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
    location.href = "index.html";
  }

  async function request(path, { method = "GET", body, token } = {}) {
    const auth = load();
    const headers = { Accept: "application/json" };
    const t = token || (auth && auth.token);
    if (t) headers.Authorization = "Basic " + t;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res;
    try {
      res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new Error("Can't reach the server. Is Man Friday running?");
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }

    if (!res.ok) {
      // Stored credentials no longer valid -> back to login
      if (res.status === 401 && !token && auth) logout();
      throw new Error((data && data.error) || `Request failed (${res.status})`);
    }
    return data;
  }

  async function login(username, password) {
    const token = btoa(unescape(encodeURIComponent(username + ":" + password)));
    const user = await request("/api/auth/me", { token });
    save({ token, user });
    return user;
  }

  // Guards a page: returns the user, or redirects when not logged in with the right role
  function requireRole(role) {
    const auth = load();
    if (!auth || !auth.user) { location.replace("index.html"); return null; }
    if (auth.user.role !== role) { location.replace(HOME[auth.user.role] || "index.html"); return null; }
    renderHeader(auth.user);
    return auth.user;
  }

  function initials(name) {
    return (name || "?").replace(/[^A-Za-z0-9]/g, " ").trim().split(/\s+/).map(p => p[0]).join("").slice(0, 2) || "?";
  }

  function renderHeader(user) {
    const header = $("header.top");
    header.replaceChildren(
      h("a", { class: "brand", href: HOME[user.role] }, h("span", { class: "logo", text: "MF" }), "Man Friday"),
      h("span", { class: "role-pill", text: ROLE_LABEL[user.role] }),
      h("span", { class: "spacer" }),
      h("span", { class: "user-chip" },
        h("span", { class: "avatar", text: initials(user.username), "aria-hidden": "true" }),
        h("span", { class: "name", text: user.username })),
      h("button", { class: "btn ghost", type: "button", onClick: logout, "data-logout": true }, icon("logout"), "Log out"),
    );
  }

  // ---------- formatting ----------

  function fmtDate(iso) {
    return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
  }

  function timeAgo(iso) {
    if (!iso) return "";
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 45) return "just now";
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const hrs = Math.round(m / 60);
    if (hrs < 24) return `${hrs} h ago`;
    const d = Math.round(hrs / 24);
    if (d < 7) return `${d} d ago`;
    return new Date(iso).toLocaleDateString();
  }

  const statusLabel = s => (STATUS[s] || { label: s }).label;
  const categoryLabel = c => (CATEGORIES[c] || { label: c }).label;

  function statusBadge(status) {
    const s = STATUS[status] || { label: status, tone: "muted" };
    return h("span", { class: `badge tone-${s.tone}`, dataset: { status } }, h("span", { class: "dot" }), s.label);
  }

  function progress(job) {
    const s = STATUS[job.status];
    if (!s || s.step < 0) {
      return h("div", { class: "stopped" }, icon("stop"), `This errand was ${statusLabel(job.status).toLowerCase()}.`);
    }
    return h("div", { class: "steps", role: "img", "aria-label": `Progress: ${STEPS[s.step]}` },
      STEPS.map((label, i) => h("div", { class: "step" + (i <= s.step ? " done" : "") + (i === s.step ? " current" : ""), text: label })));
  }

  // ---------- job card ----------

  // actions: [{text, kind, icon, onClick, confirm: {title, message, confirmText, danger}}]
  function jobCard(job, { actions = [], showClient = false, showAssistant = true, extra = null, showProgress = true } = {}) {
    const cat = CATEGORIES[job.category] || CATEGORIES.OTHER;
    const meta = [
      h("span", { title: fmtDate(job.createdAt) }, icon("clock"), `Posted ${timeAgo(job.createdAt)}`),
    ];
    if (showClient) meta.push(h("span", {}, icon("user"), `Client: ${job.clientUsername}`));
    if (showAssistant) {
      meta.push(h("span", {}, icon("helper"), job.assistantUsername ? `Assistant: ${job.assistantUsername}`
        : job.status === "PUBLISHED" ? "Waiting for an assistant" : "No assistant"));
    }

    const actionBar = actions.length || extra
      ? h("div", { class: "job-actions" }, actions.map(actionButton), extra)
      : null;

    return h("article", { class: "job", dataset: { jobId: job.id, status: job.status } },
      h("div", { class: "job-icon" }, icon(cat.icon)),
      h("div", { class: "job-main" },
        h("div", { class: "job-head" },
          h("div", {}, h("span", { class: "job-title", text: cat.label }), h("span", { class: "job-id", text: `#${job.id}` })),
          statusBadge(job.status)),
        h("p", { class: "job-body", text: job.instructions }),
        h("div", { class: "job-meta" }, meta),
        showProgress ? progress(job) : null,
        actionBar));
  }

  function actionButton(a) {
    const btn = h("button", { class: "btn " + (a.kind || ""), type: "button" }, a.icon ? icon(a.icon) : null, a.text);
    btn.addEventListener("click", async () => {
      if (a.confirm && !(await confirmDialog(a.confirm))) return;
      await withLoading(btn, a.onClick);
    });
    return btn;
  }

  // Runs fn with a spinner on btn; errors are shown as toasts
  async function withLoading(btn, fn) {
    btn.disabled = true;
    btn.classList.add("loading");
    try {
      await fn();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      btn.disabled = false;
      btn.classList.remove("loading");
    }
  }

  // ---------- lists ----------

  function renderList(container, items, toEl, empty) {
    if (!items.length) {
      container.replaceChildren(h("div", { class: "empty" },
        icon(empty.icon || "inbox"), h("strong", { text: empty.title }), empty.text || ""));
      return;
    }
    container.replaceChildren(...items.map(toEl));
  }

  function skeleton(container, n = 2) {
    container.replaceChildren(...Array.from({ length: n }, () => h("div", { class: "skeleton" })));
  }

  function setText(sel, value) {
    $$(sel).forEach(el => el.textContent = value);
  }

  // Tab group: buttons with [data-tab]; calls onChange(tabName) on click
  function bindTabs(root, onChange) {
    const tabs = $$("[data-tab]", root);
    let current = (tabs.find(t => t.getAttribute("aria-selected") === "true") || tabs[0]).dataset.tab;
    tabs.forEach(t => t.addEventListener("click", () => select(t.dataset.tab)));
    function select(name) {
      current = name;
      tabs.forEach(t => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
      onChange(name);
    }
    return { get current() { return current; }, select };
  }

  // ---------- dialog + toasts ----------

  function confirmDialog({ title, message = "", confirmText = "Confirm", danger = false }) {
    return new Promise(resolve => {
      const dlg = h("dialog", { "aria-labelledby": "dlg-title" },
        h("div", { class: "dialog-body" }, h("h3", { id: "dlg-title", text: title }), h("p", { text: message })),
        h("div", { class: "dialog-actions" },
          h("button", { class: "btn", type: "button", "data-cancel": true, onClick: () => dlg.close("cancel") }, "Go back"),
          h("button", { class: "btn " + (danger ? "solid-danger" : "primary"), type: "button", "data-confirm": true, onClick: () => dlg.close("ok") }, confirmText)));
      dlg.addEventListener("close", () => { resolve(dlg.returnValue === "ok"); dlg.remove(); });
      document.body.append(dlg);
      dlg.showModal();
      $("[data-confirm]", dlg).focus();
    });
  }

  function toast(message, kind = "info") {
    let box = $("#toasts");
    if (!box) {
      box = h("div", { id: "toasts", "aria-live": "polite", role: "status" });
      document.body.append(box);
    }
    const el = h("div", { class: "toast" + (kind === "error" ? " error" : "") },
      icon(kind === "error" ? "x" : "check"), h("span", { text: message }));
    box.append(el);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(() => { el.classList.add("leaving"); setTimeout(() => el.remove(), 300); }, kind === "error" ? 5000 : 3500);
  }

  // ---------- polling ----------

  // Calls fn every `ms` while the tab is visible, and right away when it becomes visible again
  function poll(fn, ms) {
    const run = () => { if (document.visibilityState === "visible") fn().catch(() => {}); };
    setInterval(run, ms);
    document.addEventListener("visibilitychange", run);
  }

  function markUpdated() {
    setText("[data-updated]", "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  }

  return {
    HOME, STATUS, CATEGORIES,
    h, $, $$, icon,
    request, login, logout, load, requireRole,
    fmtDate, timeAgo, statusLabel, categoryLabel, statusBadge, initials,
    jobCard, withLoading, renderList, skeleton, setText, bindTabs,
    confirmDialog, toast, poll, markUpdated,
  };
})();

"use strict";
(() => {
  const user = MF.requireRole("ADMIN");
  if (!user) return;
  const { $, h } = MF;

  const STATUSES = Object.keys(MF.STATUS);
  const ROLE_TONE = { CLIENT: "info", ASSISTANT: "violet", ADMIN: "accent" };
  const ROLE_LABEL = { CLIENT: "Client", ASSISTANT: "Assistant", ADMIN: "Admin" };

  let jobs = [];
  let users = [];
  const pendingStatus = new Map(); // job id -> status picked but not yet applied; survives auto-refresh

  const statusFilter = $("#status-filter");
  const categoryFilter = $("#category-filter");
  STATUSES.forEach(s => statusFilter.append(new Option(MF.statusLabel(s), s)));
  Object.entries(MF.CATEGORIES).forEach(([k, c]) => categoryFilter.append(new Option(c.label, k)));
  [statusFilter, categoryFilter, $("#job-search")].forEach(el => el.addEventListener("input", renderJobs));
  [$("#role-filter"), $("#user-search")].forEach(el => el.addEventListener("input", renderUsers));

  MF.bindTabs($("#views"), name => {
    $("#jobs-view").hidden = name !== "jobs";
    $("#users-view").hidden = name !== "users";
  });

  // Clicking a stat tile filters the errand list by that status
  function renderStats() {
    const tile = (label, value, tone, status) => h("button", {
      class: "stat", type: "button", style: "text-align:left;cursor:pointer;font:inherit;color:inherit",
      title: status ? `Show ${label.toLowerCase()} errands` : "Show all errands",
      onClick: () => { statusFilter.value = status; renderJobs(); $("#views [data-tab=jobs]").click(); },
    }, h("span", { class: "stat-value", text: value }),
       h("span", { class: `stat-label tone-${tone}` }, h("span", { class: "dot" }), label));

    $("#stats").replaceChildren(
      tile("All errands", jobs.length, "accent", ""),
      ...["PUBLISHED", "ASSISTANT_ACCEPTED", "IN_PROGRESS", "COMPLETED"].map(s =>
        tile(MF.statusLabel(s), jobs.filter(j => j.status === s).length, MF.STATUS[s].tone, s)),
    );
  }

  function statusControl(job) {
    const picked = pendingStatus.get(job.id) || job.status;
    const sel = h("select", { "aria-label": `New status for errand #${job.id}` },
      STATUSES.map(s => h("option", { value: s, selected: s === picked }, MF.statusLabel(s))));
    sel.addEventListener("change", () => pendingStatus.set(job.id, sel.value));
    const btn = h("button", { class: "btn", type: "button" }, "Update status");
    btn.addEventListener("click", async () => {
      const next = sel.value;
      if (next === job.status) return MF.toast("Pick a different status first", "error");
      const ok = await MF.confirmDialog({
        title: `Set errand #${job.id} to "${MF.statusLabel(next)}"?`,
        message: next === "PUBLISHED"
          ? "The errand is re-opened and its current assistant is released."
          : `Currently "${MF.statusLabel(job.status)}". Client and assistant will see the new status.`,
        confirmText: "Update status",
        danger: next === "REJECTED" || next === "CANCELLED",
      });
      if (!ok) return;
      await MF.withLoading(btn, async () => {
        await MF.request(`/api/jobs/admin/${job.id}/status?status=${encodeURIComponent(next)}`, { method: "PUT" });
        pendingStatus.delete(job.id);
        MF.toast(`Errand #${job.id} set to ${MF.statusLabel(next)}`);
        await refresh();
      });
    });
    return h("div", { class: "admin-control" }, sel, btn);
  }

  function renderJobs() {
    const raw = $("#job-search").value.trim().toLowerCase();
    // "#12" searches by id only; anything else is a text search
    const idQuery = /^#\d+$/.test(raw) ? raw.slice(1) : null;
    const q = idQuery ? "" : raw;
    const shown = jobs.filter(j =>
      (!statusFilter.value || j.status === statusFilter.value) &&
      (!categoryFilter.value || j.category === categoryFilter.value) &&
      (!idQuery || String(j.id) === idQuery) &&
      (!q || String(j.id) === q
        || j.instructions.toLowerCase().includes(q)
        || (j.clientUsername || "").toLowerCase().includes(q)
        || (j.assistantUsername || "").toLowerCase().includes(q)));
    MF.renderList($("#jobs"), shown, job => MF.jobCard(job, { showClient: true, extra: statusControl(job) }),
      jobs.length
        ? { title: "No errands match these filters", text: "Try clearing the search or filters.", icon: "search" }
        : { title: "No errands yet", text: "Errands posted by clients will appear here.", icon: "inbox" });
  }

  function renderUsers() {
    const role = $("#role-filter").value;
    const q = $("#user-search").value.trim().toLowerCase();
    const posted = id => jobs.filter(j => j.clientUsername === id).length;
    const handled = id => jobs.filter(j => j.assistantUsername === id).length;

    const shown = users.filter(u => (!role || u.role === role) &&
      (!q || u.username.toLowerCase().includes(q) || (u.skills || []).some(s => s.toLowerCase().includes(q))));

    const rows = shown.map(u => h("tr", {},
      h("td", {}, h("div", { class: "user-cell" }, h("span", { class: "avatar", text: MF.initials(u.username) }), u.username)),
      h("td", {}, h("span", { class: `badge tone-${ROLE_TONE[u.role]}` }, ROLE_LABEL[u.role])),
      h("td", { text: (u.skills || []).slice().sort().join(", ") || "–" }),
      h("td", { class: "num", text: u.role === "CLIENT" ? posted(u.username) : "–" }),
      h("td", { class: "num", text: u.role === "ASSISTANT" ? handled(u.username) : "–" })));

    $("#users").replaceChildren(...(rows.length ? rows
      : [h("tr", {}, h("td", { colspan: 5, class: "hint", text: "No users match." }))]));
  }

  async function refresh() {
    [jobs, users] = await Promise.all([MF.request("/api/jobs/admin/all"), MF.request("/api/admin/users")]);
    MF.setText('[data-count="jobs"]', jobs.length);
    MF.setText('[data-count="users"]', users.length);
    renderStats();
    renderJobs();
    renderUsers();
    MF.markUpdated();
  }

  MF.skeleton($("#jobs"), 3);
  refresh().catch(e => MF.toast(e.message, "error"));
  MF.poll(refresh, 15000);
})();

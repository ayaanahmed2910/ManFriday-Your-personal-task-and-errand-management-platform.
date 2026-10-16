"use strict";
(() => {
  const user = MF.requireRole("CLIENT");
  if (!user) return;
  const { $, h, icon } = MF;

  const GROUPS = {
    active: ["PUBLISHED", "ASSISTANT_ACCEPTED", "IN_PROGRESS"],
    done: ["COMPLETED"],
    closed: ["CANCELLED", "REJECTED"],
  };
  const EMPTY = {
    active: { title: "No active errands", text: "Post an errand above and it will show up here.", icon: "inbox" },
    done: { title: "Nothing completed yet", text: "Finished errands will be listed here.", icon: "check" },
    closed: { title: "No closed errands", text: "Cancelled or rejected errands end up here.", icon: "stop" },
    all: { title: "You haven't posted any errands yet", text: "Your first one is a minute away.", icon: "inbox" },
  };
  const CANCELLABLE = ["PUBLISHED", "ASSISTANT_ACCEPTED"];

  const list = $("#jobs");
  const form = $("#new-job");
  const textarea = $("#instructions");
  let jobs = [];
  let lastStatus = null; // id -> status from the previous load, to announce changes

  $("#greeting").textContent = `Hi, ${user.username}`;

  // Category tiles
  $("#categories").replaceChildren(...Object.entries(MF.CATEGORIES).map(([value, c]) =>
    h("label", { class: "cat-option", style: "margin:0" },
      h("input", { type: "radio", name: "category", value }),
      h("span", { class: "tile" }, icon(c.icon), c.label))));

  textarea.addEventListener("input", () => {
    $("#char-count").textContent = `${textarea.value.length} / 2000`;
  });

  const tabs = MF.bindTabs($("#filters"), render);

  function render() {
    const tab = tabs.current;
    const shown = tab === "all" ? jobs : jobs.filter(j => GROUPS[tab].includes(j.status));
    MF.renderList(list, shown, job => MF.jobCard(job, {
      actions: CANCELLABLE.includes(job.status) ? [{
        text: "Cancel errand", kind: "danger", icon: "x",
        confirm: {
          title: `Cancel errand #${job.id}?`,
          message: job.assistantUsername
            ? `${job.assistantUsername} has already accepted it and will see that it was cancelled.`
            : "It will be removed from the list assistants see.",
          confirmText: "Cancel errand", danger: true,
        },
        onClick: async () => {
          await MF.request(`/api/jobs/${job.id}/cancel`, { method: "POST" });
          MF.toast(`Errand #${job.id} cancelled`);
          await refresh(false);
        },
      }] : [],
    }), EMPTY[tab]);
  }

  function updateCounts() {
    const count = statuses => jobs.filter(j => statuses.includes(j.status)).length;
    MF.setText('[data-stat="open"]', count(["PUBLISHED"]));
    MF.setText('[data-stat="active"]', count(["ASSISTANT_ACCEPTED", "IN_PROGRESS"]));
    MF.setText('[data-stat="done"]', count(GROUPS.done));
    for (const g of Object.keys(GROUPS)) MF.setText(`[data-count="${g}"]`, count(GROUPS[g]));
    MF.setText('[data-count="all"]', jobs.length);
  }

  // Toast status changes made by someone else since the previous load
  function announceChanges(announce) {
    if (lastStatus && announce) {
      for (const j of jobs) {
        const before = lastStatus.get(j.id);
        if (!before || before === j.status) continue;
        if (j.status === "ASSISTANT_ACCEPTED") MF.toast(`Errand #${j.id} was accepted by ${j.assistantUsername}`);
        else if (j.status === "IN_PROGRESS") MF.toast(`${j.assistantUsername} started errand #${j.id}`);
        else if (j.status === "COMPLETED") MF.toast(`Errand #${j.id} is done!`);
        else MF.toast(`Errand #${j.id} is now ${MF.statusLabel(j.status).toLowerCase()}`);
      }
    }
    lastStatus = new Map(jobs.map(j => [j.id, j.status]));
  }

  async function refresh(announce = true) {
    jobs = await MF.request("/api/jobs/mine");
    announceChanges(announce);
    updateCounts();
    render();
    MF.markUpdated();
  }

  function showError(message) {
    const box = $(".form-error", form);
    box.textContent = message;
    box.hidden = !message;
  }

  form.addEventListener("submit", e => {
    e.preventDefault();
    const picked = $("input[name=category]:checked", form);
    const instructions = textarea.value.trim();
    if (!picked) return showError("Choose a category for your errand.");
    if (!instructions) return showError("Describe what needs doing.");
    showError("");

    MF.withLoading($("#post-btn"), async () => {
      const job = await MF.request("/api/jobs", { method: "POST", body: { category: picked.value, instructions } });
      form.reset();
      $("#char-count").textContent = "0 / 2000";
      MF.toast(`Errand #${job.id} posted. Assistants can see it now.`);
      tabs.select("active");
      await refresh(false);
    });
  });

  MF.skeleton(list);
  refresh().catch(e => MF.toast(e.message, "error"));
  MF.poll(refresh, 10000);
})();

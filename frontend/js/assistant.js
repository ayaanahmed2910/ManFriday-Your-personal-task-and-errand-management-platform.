"use strict";
(() => {
  const user = MF.requireRole("ASSISTANT");
  if (!user) return;
  const { $, h } = MF;

  const ACTIVE = ["ASSISTANT_ACCEPTED", "IN_PROGRESS"];
  const EMPTY = {
    available: { title: "No open errands right now", text: "New errands appear here automatically.", icon: "inbox" },
    active: { title: "Nothing on your plate", text: "Accept an errand from the Available tab to get started.", icon: "check" },
    history: { title: "No finished errands yet", text: "Errands you complete will be listed here.", icon: "clock" },
  };

  const list = $("#jobs");
  const chips = $("#cat-filter");
  let available = [];
  let mine = [];
  let category = ""; // "" = all categories
  let knownAvailable = null; // ids seen on the previous load, to announce new errands

  $("#greeting").textContent = `Hi, ${user.username}`;
  if (user.skills && user.skills.length) {
    $("#skills-line").textContent = `Your skills: ${[...user.skills].sort().join(", ")}`;
  }

  const tabs = MF.bindTabs($("#views"), () => { category = ""; render(); });

  function act(url, message) {
    return async () => {
      try {
        await MF.request(url, { method: "POST" });
      } catch (e) {
        // e.g. another assistant took the errand first: show the error and drop the stale card
        await refresh(false).catch(() => {});
        throw e;
      }
      MF.toast(message);
      await refresh(false);
    };
  }

  function actionsFor(job, view) {
    if (view === "available") {
      return [
        { text: "Accept errand", kind: "primary", icon: "check", onClick: act(`/api/jobs/${job.id}/response?accept=true`, `You accepted errand #${job.id}`) },
        {
          text: "Not for me", icon: "x",
          confirm: { title: `Skip errand #${job.id}?`, message: "It will be hidden from your list. Other assistants can still take it.", confirmText: "Skip it" },
          onClick: act(`/api/jobs/${job.id}/response?accept=false`, `Errand #${job.id} hidden`),
        },
      ];
    }
    if (job.status === "ASSISTANT_ACCEPTED") {
      return [{ text: "Start work", kind: "primary", icon: "play", onClick: act(`/api/jobs/${job.id}/start`, `Errand #${job.id} is now in progress`) }];
    }
    if (job.status === "IN_PROGRESS") {
      return [{
        text: "Mark as completed", kind: "primary", icon: "check",
        confirm: { title: `Complete errand #${job.id}?`, message: `${job.clientUsername} will see it as done.`, confirmText: "Mark completed" },
        onClick: act(`/api/jobs/${job.id}/complete`, `Nice work! Errand #${job.id} completed`),
      }];
    }
    return [];
  }

  function itemsFor(view) {
    if (view === "available") return available;
    if (view === "active") return mine.filter(j => ACTIVE.includes(j.status));
    return mine.filter(j => !ACTIVE.includes(j.status));
  }

  function renderChips(items) {
    const present = [...new Set(items.map(j => j.category))];
    if (present.length < 2) { chips.replaceChildren(); category = ""; return; }
    if (category && !present.includes(category)) category = "";
    const chip = (value, label) => h("button", {
      class: "chip", type: "button", "aria-pressed": String(category === value),
      onClick: () => { category = value; render(); },
    }, label);
    chips.replaceChildren(chip("", "All"), ...present.map(c => chip(c, MF.categoryLabel(c))));
  }

  function render() {
    const view = tabs.current;
    const items = itemsFor(view);
    renderChips(items);
    const shown = category ? items.filter(j => j.category === category) : items;
    MF.renderList(list, shown, job => MF.jobCard(job, {
      actions: actionsFor(job, view),
      showClient: true,
      showAssistant: false,
      showProgress: view !== "available",
    }), EMPTY[view]);
  }

  function updateCounts() {
    const active = itemsFor("active").length;
    MF.setText('[data-stat="available"]', available.length);
    MF.setText('[data-stat="active"]', active);
    MF.setText('[data-stat="done"]', mine.filter(j => j.status === "COMPLETED").length);
    MF.setText('[data-count="available"]', available.length);
    MF.setText('[data-count="active"]', active);
    MF.setText('[data-count="history"]', itemsFor("history").length);
  }

  async function refresh(announce = true) {
    [available, mine] = await Promise.all([MF.request("/api/jobs/available"), MF.request("/api/jobs/assigned")]);
    if (knownAvailable && announce) {
      const fresh = available.filter(j => !knownAvailable.has(j.id));
      if (fresh.length === 1) MF.toast(`New errand: ${MF.categoryLabel(fresh[0].category)} (#${fresh[0].id})`);
      else if (fresh.length > 1) MF.toast(`${fresh.length} new errands available`);
    }
    knownAvailable = new Set(available.map(j => j.id));
    updateCounts();
    render();
    MF.markUpdated();
  }

  MF.skeleton(list);
  refresh().catch(e => MF.toast(e.message, "error"));
  MF.poll(refresh, 10000);
})();

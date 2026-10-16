"use strict";
(() => {
  const { $, $$ } = MF;

  const existing = MF.load();
  if (existing && existing.user) {
    location.replace(MF.HOME[existing.user.role]);
    return;
  }

  const forms = { login: $("#login"), register: $("#register") };
  const copy = {
    login: ["Welcome back", "Log in to see your errands."],
    register: ["Create your account", "It takes less than a minute."],
  };

  MF.bindTabs($(".auth-card"), name => {
    for (const [key, form] of Object.entries(forms)) form.hidden = key !== name;
    $("#auth-title").textContent = copy[name][0];
    $("#auth-sub").textContent = copy[name][1];
    $("input", forms[name]).focus();
  });

  // Show/hide password
  $$("[data-reveal]").forEach(btn => btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.reveal);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "Hide" : "Show";
  }));

  // Skills only matter for assistants
  $$("input[name=role]").forEach(r => r.addEventListener("change", () => {
    $("#skills-field").hidden = $("input[name=role]:checked").value !== "ASSISTANT";
  }));

  function showError(form, message) {
    const box = $(".form-error", form);
    box.textContent = message;
    box.hidden = !message;
  }

  // First failing native constraint, phrased for humans
  function validate(form) {
    for (const input of $$("input[required], input[minlength], input[pattern]", form)) {
      // validity.tooShort only fires for typed input, so check length explicitly (autofill, paste)
      const tooShort = input.minLength > 0 && input.value.length > 0 && input.value.length < input.minLength;
      if (input.validity.valid && !tooShort) continue;
      const name = input.labels && input.labels[0] ? input.labels[0].textContent.trim() : input.name;
      if (input.validity.valueMissing) return `${name} is required.`;
      if (tooShort || input.validity.tooShort) return `${name} must be at least ${input.minLength} characters.`;
      if (input.validity.patternMismatch) return `${name} may only contain letters, digits, dot, underscore or dash.`;
      return `${name} is invalid.`;
    }
    return "";
  }

  async function enter(username, password) {
    const user = await MF.login(username, password);
    location.href = MF.HOME[user.role];
  }

  forms.login.addEventListener("submit", e => {
    e.preventDefault();
    const form = forms.login;
    const problem = validate(form);
    showError(form, problem);
    if (problem) return;
    MF.withLoading($("button[type=submit]", form), async () => {
      try {
        await enter($("#l-user").value.trim(), $("#l-pass").value);
      } catch (err) {
        showError(form, err.message === "Invalid or missing credentials" ? "Wrong username or password." : err.message);
      }
    });
  });

  forms.register.addEventListener("submit", e => {
    e.preventDefault();
    const form = forms.register;
    const problem = validate(form);
    showError(form, problem);
    if (problem) return;

    const role = $("input[name=role]:checked").value;
    const username = $("#r-user").value.trim();
    const password = $("#r-pass").value;
    const skills = role === "ASSISTANT"
      ? $("#r-skills").value.split(",").map(s => s.trim()).filter(Boolean)
      : [];

    MF.withLoading($("button[type=submit]", form), async () => {
      try {
        await MF.request("/api/auth/register", { method: "POST", body: { username, password, role, skills } });
        await enter(username, password);
      } catch (err) {
        showError(form, err.message);
      }
    });
  });
})();

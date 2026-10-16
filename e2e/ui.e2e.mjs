// Browser end-to-end test for the Man Friday UI.
// Drives headless Chrome via the DevTools protocol (no npm packages needed, Node 22+).
//
//   node e2e/ui.e2e.mjs [baseUrl] [screenshotDir]      (or: npm run e2e)
//
// baseUrl defaults to http://localhost:8082 and the app must already be running there.
// Screenshots go to e2e/screenshots/ by default.
// Creates uniquely named users and errands, so it can run repeatedly against the same database.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.argv[2] || "http://localhost:8082").replace(/\/$/, "");
const SHOTS = process.argv[3] || fileURLToPath(new URL("./screenshots/", import.meta.url));
const ADMIN = { user: process.env.ADMIN_USERNAME || "admin", pass: process.env.ADMIN_PASSWORD || "admin123" };
const PORT = 9333 + Math.floor(Math.random() * 500);

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const chromePath = CHROME_PATHS.find(p => existsSync(p));
if (!chromePath) { console.error("Chrome/Edge not found. Set CHROME_PATH."); process.exit(2); }

mkdirSync(SHOTS, { recursive: true });
const sfx = Date.now().toString(36).slice(-6);
const U = { client: `cli_${sfx}`, asA: `asa_${sfx}`, asB: `asb_${sfx}`, pass: "secret123" };
const TXT = { milk: `E2E-${sfx} buy milk and bread`, tv: `E2E-${sfx} fix the bedroom TV`, cancel: `E2E-${sfx} errand to cancel` };

const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0;
const failures = [];
function check(desc, ok, detail = "") {
  if (ok) { passed++; console.log(`  \u2713 ${desc}`); }
  else { failures.push(desc); console.log(`  \u2717 ${desc}${detail ? "  -> " + detail : ""}`); }
}
const step = name => console.log(`\n${name}`);

// ---------- Chrome + CDP ----------
const profile = mkdtempSync(join(tmpdir(), "mf-e2e-"));
const chrome = spawn(chromePath, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "about:blank",
], { stdio: "ignore" });

let page;
for (let i = 0; i < 75 && !page; i++) {
  try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === "page"); } catch { /* starting */ }
  if (!page) await sleep(200);
}
if (!page) { console.error("Could not connect to Chrome"); chrome.kill(); process.exit(2); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
let seq = 0;
const pending = new Map();
const jsErrors = [];
ws.addEventListener("message", ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") {
    const d = m.params.exceptionDetails;
    jsErrors.push(`${d.text} ${d.exception?.description || ""} @ ${d.url || ""}:${d.lineNumber}`);
  }
});
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });

// Page-side helpers available to every evaluate() call
const HELPERS = `
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const card = t => $$('.job').find(c => c.textContent.includes(t));
  const btnIn = (root, t) => root && [...root.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(t));
  const fill = (s, v) => { const el = $(s); el.value = v; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); };
  const toasts = () => $$('#toasts .toast').map(t => t.textContent).join(' | ');
`;
async function js(expr) {
  const r = await send("Runtime.evaluate", { expression: `(async () => { ${HELPERS}; return (${expr}); })()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(`eval failed: ${expr}\n${r.result.exceptionDetails.exception?.description}`);
  return r.result?.result?.value;
}
async function waitFor(expr, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await js(expr)) return true; } catch { /* page navigating */ }
    await sleep(150);
  }
  return false;
}
async function go(path) {
  await send("Page.navigate", { url: BASE + path });
  await waitFor("document.readyState === 'complete'");
  await sleep(300);
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(join(SHOTS, name), Buffer.from(r.result.data, "base64"));
}
const viewport = (width, height, mobile = false) =>
  send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
const confirmDialog = () => waitFor("$('dialog[open] [data-confirm]')").then(() => js("$('dialog[open] [data-confirm]').click(), true"));
const path = () => js("location.pathname");

async function logout() {
  await js("$('[data-logout]').click(), true");
  return waitFor("location.pathname === '/index.html' && !!$('#login')");
}
async function login(user, pass) {
  await go("/index.html");
  await js(`fill('#l-user', ${JSON.stringify(user)}), fill('#l-pass', ${JSON.stringify(pass)}), $('#login button[type=submit]').click(), true`);
}
async function register(user, role, skills = "") {
  await go("/index.html");
  await js(`$('[data-tab=register]').click(), true`);
  await js(`$('input[name=role][value=${role}]').click(), true`);
  await js(`fill('#r-user', ${JSON.stringify(user)}), fill('#r-pass', ${JSON.stringify(U.pass)}), fill('#r-skills', ${JSON.stringify(skills)}), $('#register button[type=submit]').click(), true`);
}

await send("Page.enable");
await send("Runtime.enable");
await viewport(1280, 900);
const LIGHT = { features: [{ name: "prefers-color-scheme", value: "light" }] };
await send("Emulation.setEmulatedMedia", LIGHT);

try {
  // ---------------------------------------------------------------
  step("Landing & login page");
  await go("/");
  check("landing page loads with login form", await waitFor("!!$('#login') && document.title === 'Man Friday'"));
  check("hero explains how it works", await js("$$('.how li').length === 3"));
  await shot("01-landing.png");

  await js("$('#login button[type=submit]').click(), true");
  check("empty login shows validation message", await waitFor("$('#login .form-error').textContent.includes('Username is required')"));

  await login(ADMIN.user, "wrong-password");
  check("wrong password shows friendly error", await waitFor("$('#login .form-error').textContent.includes('Wrong username or password')"));
  check("stays on login page after bad login", (await path()) === "/index.html");

  await js(`$('[data-tab=register]').click(), true`);
  await js(`fill('#r-user', 'ab'), fill('#r-pass', 'x'), $('#register button[type=submit]').click(), true`);
  check("sign-up validates username length", await waitFor("$('#register .form-error').textContent.includes('at least 3')"));
  check("skills field hidden for clients", await js("$('#skills-field').hidden"));
  await js("$('input[name=role][value=ASSISTANT]').click(), true");
  check("skills field shown for assistants", await js("!$('#skills-field').hidden"));

  // ---------------------------------------------------------------
  step("Client: sign up and post errands");
  await register(U.client, "CLIENT");
  check("new client lands on client dashboard", await waitFor("location.pathname === '/client.html' && !!$('#categories input')"));
  check("greeting shows username", await waitFor(`$('#greeting').textContent.includes(${JSON.stringify(U.client)})`));
  check("header shows role and user", await js(`$('header .role-pill').textContent === 'Client' && $('header .name').textContent === ${JSON.stringify(U.client)}`));
  check("empty state shown before posting", await waitFor("!!$('#jobs .empty')"));
  check("six category tiles", await js("$$('#categories input').length === 6"));

  await js("fill('#instructions', 'something'), $('#post-btn').click(), true");
  check("posting without category is blocked", await waitFor("$('#new-job .form-error').textContent.includes('category')"));

  async function post(category, text) {
    await js(`$('#categories input[value=${category}]').click(), fill('#instructions', ${JSON.stringify(text)}), $('#post-btn').click(), true`);
    return waitFor(`!!card(${JSON.stringify(text)})`);
  }
  check("character counter updates", await js("$('#char-count').textContent === '9 / 2000'"));
  check("post grocery errand", await post("GROCERY_SHOPPING", TXT.milk));
  check("success toast after posting", await waitFor("toasts().includes('posted')"));
  check("form resets after posting", await js("$('#instructions').value === '' && !$('#categories input:checked')"));
  check("post TV errand", await post("TV_REPAIR", TXT.tv));
  check("post errand to cancel", await post("OTHER", TXT.cancel));
  check("stats: 3 waiting for assistant", await waitFor("$('[data-stat=open]').textContent === '3'"));
  check("Active tab count is 3", await js("$('[data-count=active]').textContent === '3'"));
  check("new errand shows progress tracker at 'Posted'", await js(`card(${JSON.stringify(TXT.milk)}).querySelector('.step.current').textContent === 'Posted'`));

  await js(`btnIn(card(${JSON.stringify(TXT.cancel)}), 'Cancel errand').click(), true`);
  check("cancel asks for confirmation", await waitFor("!!$('dialog[open]')"));
  await js("$('dialog[open] [data-cancel]').click(), true");
  check("'Go back' keeps the errand", await waitFor(`!$('dialog[open]') && card(${JSON.stringify(TXT.cancel)}).dataset.status === 'PUBLISHED'`));
  await js(`btnIn(card(${JSON.stringify(TXT.cancel)}), 'Cancel errand').click(), true`);
  await confirmDialog();
  check("confirmed cancel removes it from Active", await waitFor(`!card(${JSON.stringify(TXT.cancel)}) && $('[data-count=active]').textContent === '2'`));
  await js("$('[data-tab=closed]').click(), true");
  check("cancelled errand appears under Cancelled tab", await waitFor(`card(${JSON.stringify(TXT.cancel)})?.dataset.status === 'CANCELLED'`));
  await js("$('[data-tab=active]').click(), true");
  await shot("02-client.png");

  await go("/admin.html");
  check("client is redirected away from admin page", await waitFor("location.pathname === '/client.html'"));
  check("logout returns to login page", await logout());
  await go("/client.html");
  check("logged-out user is sent to login", await waitFor("location.pathname === '/index.html'"));

  // ---------------------------------------------------------------
  step("Assistant A: skip one, accept and complete another");
  await register(U.asA, "ASSISTANT", "electronics, paperwork");
  check("assistant lands on assistant dashboard", await waitFor("location.pathname === '/assistant.html' && !!$('#jobs .job, #jobs .empty')"));
  check("skills shown in heading", await waitFor("$('#skills-line').textContent.includes('electronics')"));
  check("both open errands are available", await waitFor(`!!card(${JSON.stringify(TXT.milk)}) && !!card(${JSON.stringify(TXT.tv)})`));
  check("cancelled errand is not available", await js(`!card(${JSON.stringify(TXT.cancel)})`));
  check("available cards show client name", await js(`card(${JSON.stringify(TXT.milk)}).textContent.includes(${JSON.stringify(U.client)})`));

  await js(`btnIn(card(${JSON.stringify(TXT.tv)}), 'Not for me').click(), true`);
  await confirmDialog();
  check("skipped errand disappears", await waitFor(`!card(${JSON.stringify(TXT.tv)})`));

  await js(`btnIn(card(${JSON.stringify(TXT.milk)}), 'Accept errand').click(), true`);
  check("accepted errand leaves Available", await waitFor(`!card(${JSON.stringify(TXT.milk)}) && $('[data-count=active]').textContent === '1'`));
  await js("$('[data-tab=active]').click(), true");
  check("accepted errand under My active with Start button", await waitFor(`!!btnIn(card(${JSON.stringify(TXT.milk)}), 'Start work')`));
  await js(`btnIn(card(${JSON.stringify(TXT.milk)}), 'Start work').click(), true`);
  check("Start moves errand to In progress", await waitFor(`card(${JSON.stringify(TXT.milk)})?.dataset.status === 'IN_PROGRESS'`));
  await js(`btnIn(card(${JSON.stringify(TXT.milk)}), 'Mark as completed').click(), true`);
  await confirmDialog();
  check("completed errand leaves My active", await waitFor(`!card(${JSON.stringify(TXT.milk)})`));
  await js("$('[data-tab=history]').click(), true");
  check("completed errand in History", await waitFor(`card(${JSON.stringify(TXT.milk)})?.dataset.status === 'COMPLETED'`));
  check("stats: 1 completed by me", await js("$('[data-stat=done]').textContent === '1'"));
  await shot("03-assistant.png");
  await logout();

  // ---------------------------------------------------------------
  step("Assistant B: sees only what is still open");
  await register(U.asB, "ASSISTANT");
  check("assistant B sees the TV errand A skipped", await waitFor(`!!card(${JSON.stringify(TXT.tv)})`));
  check("assistant B does not see A's completed errand", await js(`!card(${JSON.stringify(TXT.milk)})`));
  const tvId = await js(`Number(card(${JSON.stringify(TXT.tv)}).dataset.jobId)`);
  await logout();

  // ---------------------------------------------------------------
  step("Client: live updates");
  await login(U.client, U.pass);
  check("client logs in through form", await waitFor("location.pathname === '/client.html'"));
  check("Completed tab count is 1", await waitFor("$('[data-count=done]').textContent === '1'"));
  await js("$('[data-tab=done]').click(), true");
  check("completed errand shows assistant A", await waitFor(`card(${JSON.stringify(TXT.milk)})?.textContent.includes(${JSON.stringify(U.asA)})`));
  check("progress tracker shows Done", await js(`card(${JSON.stringify(TXT.milk)}).querySelector('.step.current').textContent === 'Done'`));
  await js("$('[data-tab=active]').click(), true");

  // Assistant B accepts in the background; the open client page should notice by itself
  const tokenB = Buffer.from(`${U.asB}:${U.pass}`).toString("base64");
  const status = await js(`fetch('/api/jobs/${tvId}/response?accept=true', {method:'POST', headers:{Authorization:'Basic ${tokenB}'}}).then(r => r.status)`);
  check("assistant B accepts via API", status === 200, `HTTP ${status}`);
  check("client page auto-refreshes and notifies", await waitFor(`toasts().includes('accepted by ${U.asB}')`, 16000), await js("toasts()"));
  check("card updates to Accepted without reload", await js(`card(${JSON.stringify(TXT.tv)})?.dataset.status === 'ASSISTANT_ACCEPTED'`));

  step("Responsive layout");
  await viewport(390, 844, true);
  await go("/client.html");
  await waitFor("!!$('#jobs .job')");
  check("no horizontal scroll on phone width (client)", await js("document.documentElement.scrollWidth <= window.innerWidth"));
  await shot("04-client-mobile.png");
  await viewport(1280, 900);
  await logout();

  // ---------------------------------------------------------------
  step("Admin console");
  await login(ADMIN.user, ADMIN.pass);
  check("admin lands on admin console", await waitFor("location.pathname === '/admin.html' && !!$('#stats .stat')"));
  check("five stat tiles", await js("$$('#stats .stat').length === 5"));
  await js(`fill('#job-search', 'E2E-${sfx}'), true`);
  check("search finds this run's 3 errands", await waitFor("$$('#jobs .job').length === 3"));
  await js(`fill('#job-search', '#${tvId}'), true`);
  check("search by #id finds exactly one", await waitFor(`$$('#jobs .job').length === 1 && $('#jobs .job').dataset.jobId === '${tvId}'`));
  await js(`fill('#job-search', 'E2E-${sfx}'), fill('#status-filter', 'COMPLETED'), true`);
  check("status filter narrows to completed", await waitFor("$$('#jobs .job').length === 1 && $('#jobs .job').dataset.status === 'COMPLETED'"));
  await js(`fill('#status-filter', ''), fill('#category-filter', 'OTHER'), true`);
  check("category filter narrows to Other", await waitFor("$$('#jobs .job').length === 1 && $('#jobs .job').dataset.status === 'CANCELLED'"));
  await js(`fill('#category-filter', ''), fill('#job-search', 'zzz-no-match-zzz'), true`);
  check("no-match empty state", await waitFor("!!$('#jobs .empty')"));
  await js(`fill('#job-search', '#${tvId}'), true`);
  await waitFor("$$('#jobs .job').length === 1");

  await js(`(() => { const s = $('#jobs .job select'); s.value = 'REJECTED'; s.dispatchEvent(new Event('change', {bubbles:true})); btnIn($('#jobs .job'), 'Update status').click(); })(), true`);
  check("status change asks for confirmation", await waitFor("!!$('dialog[open]')"));
  await confirmDialog();
  check("admin sets errand to Rejected", await waitFor(`$('#jobs .job[data-job-id="${tvId}"]')?.dataset.status === 'REJECTED'`));

  await js("$('[data-tab=users]').click(), true");
  check("users tab lists the new accounts", await waitFor(`['${U.client}','${U.asA}','${U.asB}'].every(u => $$('#users tr').some(r => r.textContent.includes(u)))`));
  check("assistant A handled 1 errand", await js(`$$('#users tr').find(r => r.textContent.includes('${U.asA}')).lastElementChild.textContent === '1'`));
  check("client posted 3 errands", await js(`$$('#users tr').find(r => r.textContent.includes('${U.client}')).children[3].textContent === '3'`));
  await js("fill('#role-filter', 'ADMIN'), true");
  check("role filter shows only admins", await waitFor("$$('#users tr').length >= 1 && $$('#users tr').every(r => r.textContent.includes('Admin'))"));
  await js("fill('#role-filter', ''), $('[data-tab=jobs]').click(), fill('#job-search', ''), true");

  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await sleep(300);
  check("dark mode applies", await js("getComputedStyle(document.body).backgroundColor !== 'rgb(245, 244, 240)'"));
  await shot("05-admin-dark.png");
  await send("Emulation.setEmulatedMedia", LIGHT);

  step("Client sees admin's change");
  await logout();
  await login(U.client, U.pass);
  await waitFor("location.pathname === '/client.html'");
  await js("$('[data-tab=closed]').click(), true");
  check("rejected errand shows under Cancelled tab", await waitFor(`card(${JSON.stringify(TXT.tv)})?.dataset.status === 'REJECTED'`));
  check("stopped errand explains its state", await js(`!!card(${JSON.stringify(TXT.tv)})?.querySelector('.stopped')?.textContent.includes('rejected')`));

  step("Page health");
  check("no JavaScript errors on any page", jsErrors.length === 0, jsErrors.join("\n"));
} catch (e) {
  failures.push("crashed: " + e.message);
  console.error(e);
} finally {
  ws.close();
  chrome.kill();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold files */ }
}

console.log(`\n${passed} passed, ${failures.length} failed. Screenshots: ${SHOTS}`);
if (failures.length) { console.log("Failed:\n - " + failures.join("\n - ")); process.exit(1); }

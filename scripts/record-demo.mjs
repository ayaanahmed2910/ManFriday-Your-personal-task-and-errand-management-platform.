// Records a narrated walkthrough video of Man Friday.
//
//   node scripts/record-demo.mjs [baseUrl] [output.mp4]      (or: npm run demo)
//
// Output defaults to docs/demo/man-friday-demo.mp4.
// Needs the app running with demo data (node scripts/seed-demo.mjs), Chrome/Edge, and ffmpeg
// (on PATH or via the FFMPEG env var). Frames come from Chrome's screencast stream and are encoded to H.264.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.argv[2] || "http://localhost:8082").replace(/\/$/, "");
const OUT = process.argv[3] ? resolve(process.argv[3])
  : fileURLToPath(new URL("../docs/demo/man-friday-demo.mp4", import.meta.url));
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const PASSWORD = "demo1234";
const ADMIN = { user: process.env.ADMIN_USERNAME || "admin", pass: process.env.ADMIN_PASSWORD || "admin123" };
const W = 1280, H = 720, FRAME_MS = 66; // minimum hold per frame

const chromePath = [process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean).find(p => existsSync(p));
if (!chromePath) { console.error("Chrome/Edge not found. Set CHROME_PATH."); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const basic = (u, p) => "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
async function api(path, user, pass = PASSWORD, method = "GET", body) {
  const res = await fetch(BASE + path, {
    method, headers: { Authorization: basic(user, pass), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  return res.json();
}

// ---------- preconditions: demo data present, Priya has an open errand for the live-update scene ----------
try { await api("/api/auth/me", "priya.sharma"); }
catch { console.error("Demo users missing. Run: node scripts/seed-demo.mjs"); process.exit(1); }
let liveJob = (await api("/api/jobs/mine", "priya.sharma")).find(j => j.status === "PUBLISHED");
if (!liveJob) {
  liveJob = await api("/api/jobs", "priya.sharma", PASSWORD, "POST", { category: "BILL_PAYMENT",
    instructions: "Pay the BESCOM electricity bill at the Jayanagar counter (consumer no. 5501-2287), about Rs 2,350. Please bring back the stamped receipt." });
}
const NEW_ERRAND = "Pick up my new phone from the Croma store in Forum Mall (order CR-55821, already paid) and bring it home by 6 pm.";

// ---------- Chrome ----------
const profile = mkdtempSync(join(tmpdir(), "mf-rec-"));
const frameDir = mkdtempSync(join(tmpdir(), "mf-frames-"));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(chromePath, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
let target;
for (let i = 0; i < 75 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === "page"); } catch { /* starting */ }
  if (!target) await sleep(200);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });

// In-page presentation layer: caption bar, fake cursor, click ripple, human-speed typing.
// State lives in sessionStorage so the caption and cursor survive page navigations.
const OVERLAY = `
(() => {
  const css = \`
    #toasts{bottom:104px !important}
    #demo-cap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483646;max-width:86%;
      background:rgba(18,18,20,.9);color:#fff;font:600 19px/1.4 system-ui,"Segoe UI",sans-serif;padding:12px 22px;
      border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.25);text-align:center;transition:opacity .3s}
    #demo-cap small{display:block;font-weight:500;font-size:14px;opacity:.75;margin-top:2px}
    #demo-cursor{position:fixed;z-index:2147483647;width:26px;height:26px;pointer-events:none;
      transition:left .6s cubic-bezier(.4,0,.2,1),top .6s cubic-bezier(.4,0,.2,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
    .demo-ripple{position:fixed;z-index:2147483645;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;
      border:3px solid #2e8b6e;pointer-events:none;animation:demo-rip .7s ease-out forwards}
    @keyframes demo-rip{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}\`;
  const S = { get(k, d) { try { return JSON.parse(sessionStorage.getItem('demo.' + k)) ?? d; } catch { return d; } },
              set(k, v) { try { sessionStorage.setItem('demo.' + k, JSON.stringify(v)); } catch {} } };
  function mount() {
    if (document.getElementById('demo-cap')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.append(st);
    const cap = document.createElement('div'); cap.id = 'demo-cap'; document.body.append(cap);
    const cur = document.createElement('div'); cur.id = 'demo-cursor';
    cur.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l15 10.5-6.6 1.2 3.9 7.3-2.7 1.4-3.9-7.3L4 19.5z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.append(cur);
    const p = S.get('cursor', { x: innerWidth / 2, y: innerHeight / 2 });
    cur.style.left = p.x + 'px'; cur.style.top = p.y + 'px';
    render();
  }
  function render() {
    const cap = document.getElementById('demo-cap'); if (!cap) return;
    const c = S.get('caption', null);
    cap.style.opacity = c ? 1 : 0;
    cap.replaceChildren();
    if (c) { cap.append(c.title); if (c.sub) { const s = document.createElement('small'); s.textContent = c.sub; cap.append(s); } }
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  window.__demo = {
    caption(title, sub) { S.set('caption', title ? { title, sub } : null); render(); },
    async move(el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' }); await wait(450);
      const r = el.getBoundingClientRect(); const x = r.left + Math.min(r.width / 2, 60), y = r.top + r.height / 2;
      const cur = document.getElementById('demo-cursor'); cur.style.left = x + 'px'; cur.style.top = y + 'px';
      S.set('cursor', { x, y }); await wait(650); return { x, y };
    },
    async click(el) {
      if (!el) throw new Error('demo.click: element not found');
      const { x, y } = await this.move(el);
      const rip = document.createElement('div'); rip.className = 'demo-ripple'; rip.style.left = x + 'px'; rip.style.top = y + 'px';
      document.body.append(rip); setTimeout(() => rip.remove(), 800);
      await wait(120); el.click(); await wait(250);
    },
    async type(el, text, cps = 22) {
      await this.click(el); el.focus();
      for (const ch of text) { el.value += ch; el.dispatchEvent(new Event('input', { bubbles: true })); await wait(1000 / cps); }
    },
    async scroll(y) { window.scrollTo({ top: y, behavior: 'smooth' }); await wait(900); },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();`;

const HELPERS = `
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const card = t => $$('.job').find(c => c.textContent.includes(t));
  const btnIn = (root, t) => root && [...root.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(t));
  const D = window.__demo;`;
async function js(expr) {
  const r = await send("Runtime.evaluate", { expression: `(async () => { ${HELPERS}; return (${expr}); })()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(`${expr}\n${r.result.exceptionDetails.exception?.description}`);
  return r.result?.result?.value;
}
async function waitFor(expr, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { if (await js(expr)) return true; } catch { /* navigating */ } await sleep(150); }
  throw new Error("timed out waiting for: " + expr);
}
const caption = (title, sub = "") => js(`D.caption(${JSON.stringify(title)}, ${JSON.stringify(sub)})`);
const click = expr => js(`D.click(${expr})`);
const type = (expr, text, cps) => js(`D.type(${expr}, ${JSON.stringify(text)}, ${cps || 22})`);

async function login(user, pass = PASSWORD) {
  await waitFor("!!$('#login') && !!window.__demo");
  await type("$('#l-user')", user);
  await type("$('#l-pass')", pass, 30);
  await click("$('#login button[type=submit]')");
}
async function logout() {
  await click("$('[data-logout]')");
  await waitFor("location.pathname === '/index.html' && !!window.__demo");
}

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: OVERLAY });
await send("Page.navigate", { url: BASE + "/" });
await waitFor("!!window.__demo && !!$('#login')");
await js("sessionStorage.clear(), D.caption(null), true");

// ---------- frame capture: Chrome pushes a frame whenever the screen changes ----------
// (Page.captureScreenshot polling stalls across navigations; the screencast stream does not.)
const frames = [];
let frameNo = 0;
ws.addEventListener("message", ev => {
  const m = JSON.parse(ev.data);
  if (m.method !== "Page.screencastFrame") return;
  const file = `f${String(++frameNo).padStart(5, "0")}.jpg`;
  writeFileSync(join(frameDir, file), Buffer.from(m.params.data, "base64"));
  frames.push({ t: m.params.metadata.timestamp * 1000, file });
  send("Page.screencastFrameAck", { sessionId: m.params.sessionId });
});
await send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
await js("D.caption(null), true"); // nudge a first frame

const scene = name => console.log(`  scene: ${name}`);
try {
  // 1. Intro
  scene("intro");
  await caption("Man Friday", "Post an errand, and a trusted assistant gets it done");
  await sleep(3800);

  // 2. Client logs in
  scene("client login");
  await caption("Priya is a client. She logs in", "Clients post errands; assistants pick them up");
  await login("priya.sharma");
  await waitFor("location.pathname === '/client.html' && !!$('#jobs .job')");
  await caption("Her dashboard", "Live stats, and every errand she has posted");
  await sleep(2600);
  await js("D.scroll(640)");
  await caption("Each errand has a progress tracker", "Posted → Accepted → In progress → Done");
  await sleep(3200);
  await js("D.scroll(0)");

  // 3. Post a new errand
  scene("post errand");
  await caption("She posts a new errand", "Pick a category, describe the task, post");
  await click("$('#categories input[value=PARCEL_PICKUP]').nextElementSibling");
  await type("$('#instructions')", NEW_ERRAND, 40);
  await sleep(500);
  await click("$('#post-btn')");
  await waitFor(`!!card(${JSON.stringify(NEW_ERRAND.slice(0, 30))})`);
  await caption("Posted! Assistants can see it right away", "It starts at the first step: Posted");
  await sleep(1200);
  await js(`D.move(card(${JSON.stringify(NEW_ERRAND.slice(0, 30))}))`);
  await sleep(2400);
  await caption("Errands are sorted into tabs", "Active, Completed, Closed, All");
  await click("$('[data-tab=done]')");
  await sleep(2200);
  await click("$('[data-tab=active]')");
  await sleep(800);
  await logout();

  // 4. Assistant accepts and completes
  scene("assistant");
  await caption("Arjun is an assistant", "He runs deliveries and shopping errands");
  await login("arjun.singh");
  await waitFor("location.pathname === '/assistant.html' && !!$('#jobs .job')");
  await caption("Open errands from every client", "With his skills and stats at the top");
  await sleep(2800);
  await caption("He can filter by category");
  await click("$$('#cat-filter .chip').find(c => c.textContent === 'Parcel pickup')");
  await sleep(2200);
  await caption("He accepts Priya's errand");
  await click(`btnIn(card("Croma store"), 'Accept errand')`);
  await waitFor("$('[data-count=active]').textContent !== '0'");
  await sleep(1400);
  await caption("It moves to his active list", "Next: start the work");
  await click("$('[data-tab=active]')");
  await sleep(1200);
  await click(`btnIn(card("Croma store"), 'Start work')`);
  await waitFor(`card("Croma store")?.dataset.status === 'IN_PROGRESS'`);
  await caption("In progress", "Priya can follow every step");
  await sleep(2000);
  await caption("Done? He marks it completed", "Important actions ask for confirmation first");
  await click(`btnIn(card("Croma store"), 'Mark as completed')`);
  await waitFor("!!$('dialog[open]')");
  await sleep(1600);
  await click("$('dialog[open] [data-confirm]')");
  await sleep(900);
  await click("$('[data-tab=history]')");
  await caption("Finished work is kept in his history");
  await sleep(2400);
  await logout();

  // 5. Client sees completion + live update
  scene("client live update");
  await caption("Back to Priya", "Her errand now shows as done");
  await login("priya.sharma");
  await waitFor("location.pathname === '/client.html' && !!$('#jobs .job')");
  await click("$('[data-tab=done]')");
  await sleep(600);
  await js(`D.move(card("Croma store"))`);
  await sleep(2400);
  await click("$('[data-tab=active]')");
  await js("D.scroll(560)");
  await caption("Live updates", "While Priya watches, assistant Meena accepts her bill payment errand");
  await sleep(1500);
  await api(`/api/jobs/${liveJob.id}/response?accept=true`, "meena.iyer", PASSWORD, "POST");
  await waitFor("[...document.querySelectorAll('#toasts .toast')].some(t => t.textContent.includes('meena.iyer'))", 15000);
  await caption("The page updates by itself and notifies her", "No reload needed");
  await js(`D.move(card(${JSON.stringify(liveJob.instructions.slice(0, 25))}))`);
  await sleep(3500);
  await js("D.scroll(0)");
  await logout();

  // 6. Admin
  scene("admin");
  await caption("The admin oversees the whole platform");
  await login(ADMIN.user, ADMIN.pass);
  await waitFor("location.pathname === '/admin.html' && !!$('#jobs .job')");
  await caption("Platform-wide stats", "Click a tile to filter by that status");
  await sleep(2800);
  await caption("Search every errand", "By text, user, or #id");
  await type("$('#job-search')", "passport", 12);
  await sleep(2600);
  await js("(() => { const s = $('#job-search'); s.value = ''; s.dispatchEvent(new Event('input', {bubbles:true})); })(), true");
  await caption("Or filter by status");
  await click("$$('#stats .stat')[4]");
  await sleep(2600);
  await click("$$('#stats .stat')[0]");
  await sleep(600);
  await caption("Admins can set any errand's status", "For example, reject a duplicate request");
  await js("D.move($('#jobs .job .admin-control select'))");
  await sleep(2200);
  await caption("And see every account with its activity");
  await click("$('[data-tab=users]')");
  await sleep(3400);
  await logout();

  // 7. Outro
  scene("outro");
  await js("D.scroll(0)");
  await caption("Man Friday", "Spring Boot · MySQL · HTML/CSS/JS");
  await sleep(3500);
} finally {
  await send("Page.stopScreencast");
  ws.close();
  chrome.kill();
}
const stoppedAt = Date.now();

// ---------- encode: each frame is held until the next one was captured ----------
console.log(`  captured ${frames.length} frames`);
const lines = [];
frames.forEach((f, i) => {
  // screencast timestamps are wall-clock seconds, so the last frame is held until recording stopped
  const next = frames[i + 1] ? frames[i + 1].t : Math.max(stoppedAt, f.t + FRAME_MS);
  lines.push(`file '${f.file}'`, `duration ${((next - f.t) / 1000).toFixed(3)}`);
});
lines.push(`file '${frames.at(-1).file}'`); // concat demuxer needs the last file repeated
writeFileSync(join(frameDir, "frames.txt"), lines.join("\n"));

mkdirSync(dirname(OUT), { recursive: true });
const enc = spawnSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error",
  "-f", "concat", "-safe", "0", "-i", "frames.txt",
  "-vf", "fps=30,scale=out_range=tv:out_color_matrix=bt709,format=yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-c:v", "libx264", "-preset", "slow", "-crf", "22",
  "-movflags", "+faststart", OUT], { cwd: frameDir, stdio: "inherit" });
if (enc.status !== 0) { console.error(`ffmpeg failed. Frames kept in ${frameDir}`); process.exit(1); }
const secs = ((stoppedAt - frames[0].t) / 1000).toFixed(1);
console.log(`Video written: ${OUT} (${secs}s)`);
rmSync(frameDir, { recursive: true, force: true });
try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold files */ }

// Seeds realistic demo data through the public API.
//
//   node scripts/seed-demo.mjs [baseUrl]      (or: npm run seed)
//
// Safe to run more than once: users that already exist are reused, and a client's
// errands are only created if that client has none yet. All demo users share the password below.
const BASE = (process.argv[2] || "http://localhost:8082").replace(/\/$/, "");
const PASSWORD = "demo1234";
const ADMIN = { user: process.env.ADMIN_USERNAME || "admin", pass: process.env.ADMIN_PASSWORD || "admin123" };

const CLIENTS = ["priya.sharma", "rahul.verma", "anita.desai"];
const ASSISTANTS = {
  "ravi.kumar": ["electronics", "tv repair", "appliances"],
  "meena.iyer": ["paperwork", "government offices", "notary"],
  "arjun.singh": ["driving", "deliveries", "shopping"],
};

// Each errand ends in the given state. `by` = assistant who handles it, `skippedBy` = assistant who declines first.
const ERRANDS = [
  { client: "priya.sharma", category: "TV_REPAIR", end: "IN_PROGRESS", by: "ravi.kumar",
    text: "Samsung 43-inch TV shows no picture but sound works. Please take it to the authorised service centre in Koramangala and get an estimate before approving any repair." },
  { client: "priya.sharma", category: "GROCERY_SHOPPING", end: "COMPLETED", by: "arjun.singh",
    text: "Weekly groceries from More Supermarket: 5 kg atta, 2 L milk, a dozen eggs, and vegetables for the week (list shared on WhatsApp). Deliver by 7 pm Saturday." },
  { client: "priya.sharma", category: "BILL_PAYMENT", end: "PUBLISHED",
    text: "Pay the BESCOM electricity bill at the Jayanagar counter (consumer no. 5501-2287), about Rs 2,350. Please bring back the stamped receipt." },
  { client: "rahul.verma", category: "DOCUMENT_SUBMISSION", end: "ASSISTANT_ACCEPTED", by: "meena.iyer",
    text: "Submit my passport renewal application at the Lalbagh Passport Seva Kendra. Appointment is Friday 10:30 am; all documents are in the blue folder with the watchman." },
  { client: "rahul.verma", category: "PARCEL_PICKUP", end: "PUBLISHED",
    text: "Collect a parcel from the Blue Dart office in HSR Layout (AWB 7845 1236 90) and drop it at my flat, B-204 Green Meadows." },
  { client: "rahul.verma", category: "OTHER", end: "CANCELLED",
    text: "Wait at my flat between 2 and 5 pm on Tuesday to let the plumber in and keep an eye on the kitchen sink repair." },
  { client: "anita.desai", category: "DOCUMENT_SUBMISSION", end: "COMPLETED", by: "meena.iyer",
    text: "Get three copies of my property sale deed notarised and submit one at the BBMP ward office, Ward 151. Keep the acknowledgement slip." },
  { client: "anita.desai", category: "GROCERY_SHOPPING", end: "PUBLISHED", skippedBy: "ravi.kumar",
    text: "Pick up my mother's monthly medicines from Apollo Pharmacy, Indiranagar (prescription is on file there) and drop them at 12th Main." },
  { client: "anita.desai", category: "TV_REPAIR", end: "ASSISTANT_ACCEPTED", by: "ravi.kumar",
    text: "The Tata Play set-top box remote stopped working. Buy a compatible replacement remote and pair it with the box." },
  { client: "anita.desai", category: "BILL_PAYMENT", end: "REJECTED",
    text: "Renew the broadband plan for 12 months at the ACT Fibernet store. (Duplicate request: already renewed online.)" },
];

const token = (u, p) => "Basic " + Buffer.from(`${u}:${p}`).toString("base64");

async function api(path, { method = "GET", body, user, pass = PASSWORD } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(user ? { Authorization: token(user, pass) } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(`${method} ${path} -> ${res.status} ${data?.error || ""}`), { status: res.status });
  return data;
}

async function ensureUser(username, role, skills = []) {
  try {
    await api("/api/auth/register", { method: "POST", body: { username, password: PASSWORD, role, skills } });
    console.log(`  + ${role.toLowerCase()} ${username}`);
  } catch (e) {
    if (e.status !== 409) throw e;
    await api("/api/auth/me", { user: username }); // exists: make sure the demo password still works
    console.log(`  = ${role.toLowerCase()} ${username} (already exists)`);
  }
}

try {
  await fetch(BASE + "/health");
} catch {
  console.error(`Man Friday is not reachable at ${BASE}. Start it first.`);
  process.exit(1);
}

console.log(`Seeding demo data into ${BASE}\nUsers (password: ${PASSWORD})`);
for (const c of CLIENTS) await ensureUser(c, "CLIENT");
for (const [a, skills] of Object.entries(ASSISTANTS)) await ensureUser(a, "ASSISTANT", skills);

console.log("Errands");
const hasJobs = {};
for (const c of CLIENTS) hasJobs[c] = (await api("/api/jobs/mine", { user: c })).length > 0;

for (const e of ERRANDS) {
  if (hasJobs[e.client]) continue;
  const job = await api("/api/jobs", { method: "POST", user: e.client, body: { category: e.category, instructions: e.text } });
  const id = job.id;

  if (e.skippedBy) await api(`/api/jobs/${id}/response?accept=false`, { method: "POST", user: e.skippedBy });
  if (e.by) await api(`/api/jobs/${id}/response?accept=true`, { method: "POST", user: e.by });
  if (["IN_PROGRESS", "COMPLETED"].includes(e.end)) await api(`/api/jobs/${id}/start`, { method: "POST", user: e.by });
  if (e.end === "COMPLETED") await api(`/api/jobs/${id}/complete`, { method: "POST", user: e.by });
  if (e.end === "CANCELLED") await api(`/api/jobs/${id}/cancel`, { method: "POST", user: e.client });
  if (e.end === "REJECTED") await api(`/api/jobs/admin/${id}/status?status=REJECTED`, { method: "PUT", user: ADMIN.user, pass: ADMIN.pass });

  console.log(`  #${id} ${e.client.padEnd(13)} ${e.category.padEnd(20)} -> ${e.end}${e.by ? " (" + e.by + ")" : ""}`);
}
for (const c of CLIENTS) if (hasJobs[c]) console.log(`  ${c} already has errands, skipped`);
console.log("Done.");

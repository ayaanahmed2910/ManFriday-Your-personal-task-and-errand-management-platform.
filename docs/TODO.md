# TODO - Man Friday

## Step 1: Create backend (Spring Boot)
- [x] Initialize Spring Boot project files (manual scaffold)
- [x] Add Spring Security

## Step 2: Configure database
- [x] MySQL schema in `src/main/resources/schema.sql` (auto-applied on startup; DB auto-created)

## Step 3: Implement DB-backed auth + RBAC
- [x] Create entities: AppUser (CLIENT/ASSISTANT/ADMIN)
- [x] Create repositories
- [x] Login: stateless HTTP Basic against DB users (BCrypt); `GET /api/auth/me`
- [x] Registration for CLIENT/ASSISTANT only; ADMIN seeded from config
- [x] Enforce role-based authorization on endpoints (SecurityConfig)

## Step 4: Implement job workflow
- [x] Entities: JobRequest (client post), Assignment (per-assistant accept/reject)
- [x] Status transitions: PUBLISHED -> ASSISTANT_ACCEPTED -> IN_PROGRESS -> COMPLETED (+ CANCELLED / REJECTED)
- [x] REST APIs:
  - Client: create job request, list mine, cancel
  - Assistant: list available jobs; accept/reject; list assigned; start; complete
  - Admin: list jobs; update/resolve status; list users
- [x] JSON error responses (400/401/403/404/409)

## Step 5: Create frontend (HTML/CSS/JS)
- [x] Static pages for login/register, client, assistant, admin
- [x] JS to call backend APIs
- [x] Role-aware UI (redirects to the right dashboard)
- [x] Landing page, progress tracker, filters/search, confirm dialogs, live auto-refresh + notifications
- [x] Responsive (phone) layout and light/dark theme

## Step 6: Run & test end-to-end (first working version)
- [x] Run Spring Boot against local MySQL
- [x] Create one client + one assistant + admin
- [x] Client posts job -> assistant accepts -> client sees status
- [x] Automated integration tests (`mvn test`, H2 in-memory)
- [x] Browser end-to-end test of all roles (`npm run e2e`, 69 checks)

## Possible next steps
- [ ] Replace HTTP Basic with JWT or session login if the app is exposed beyond localhost (requires HTTPS)
- [ ] Notifications (email/SMS) when a job is accepted or completed
- [ ] Ratings/reviews and payments

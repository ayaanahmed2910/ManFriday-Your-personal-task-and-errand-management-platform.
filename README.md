# Man Friday

A small errand-booking platform. Clients post errands, assistants accept and complete them, admins oversee everything.

- **Backend:** Spring Boot 3.3 (Java 17+), Spring Security, Spring Data JPA, MySQL
- **Frontend:** plain HTML/CSS/JS, served by the backend at `http://localhost:8082/`

A recorded walkthrough is in [`docs/demo/man-friday-demo.mp4`](docs/demo/man-friday-demo.mp4).

## Project structure

```
Man Friday/
├── run.cmd                  Double-click to start the app (checks Java, MySQL, port)
├── package.json             npm shortcuts for the tools below (no dependencies)
├── .editorconfig            Shared formatting rules (UTF-8, LF, 4-space Java, 2-space web)
├── .gitattributes           Line-ending rules (CRLF only for .cmd)
├── backend/                 Spring Boot application (Maven project)
│   ├── pom.xml
│   ├── mvnw, mvnw.cmd, .mvn/  Maven wrapper: builds without a global Maven install
│   └── src/
│       ├── main/java/com/manfriday/
│       │   ├── ManFridayApplication.java
│       │   ├── user/          AppUser entity + repository, register/login API,
│       │   │                  admin user list, admin account seeding, DTOs
│       │   ├── job/           JobRequest + Assignment entities, repositories,
│       │   │                  JobService (workflow rules), JobController, DTOs
│       │   ├── security/      SecurityConfig (URL rules) + database user lookup
│       │   └── common/        Global JSON error handler, NotFoundException, /health
│       ├── main/resources/
│       │   ├── application.properties
│       │   └── schema.sql     MySQL schema, applied on startup
│       └── test/java/com/manfriday/
│           └── job/           Workflow integration tests (H2 in-memory)
├── frontend/                Web UI (plain HTML/CSS/JS, no build step)
│   ├── index.html           Landing page: log in / sign up
│   ├── client.html, assistant.html, admin.html   One dashboard per role
│   ├── css/style.css        All styles (light/dark theme, phone layout)
│   └── js/                  app.js (shared helpers) + one script per page
├── e2e/                     Browser end-to-end test (headless Chrome)
├── scripts/                 seed-demo (sample data), record-demo (walkthrough video)
└── docs/                    TODO.md (roadmap), demo/ (video)
```

The backend is organised **by feature**: everything about users lives in `user/`, everything about errands in `job/`. A new feature (for example ratings) gets its own package with its entity, repository, service, controller and DTOs, and tests go in the same package under `src/test`. Only cross-cutting code goes in `security/` and `common/`.

The frontend lives in its own top-level `frontend/` folder. When the backend builds, Maven copies it into the app as static content (see `<resources>` in `backend/pom.xml`), so Spring Boot still serves it at `http://localhost:8082/` and there is no separate frontend server or build. After editing frontend files, restart the app to see the changes.

## Run

Prerequisites: JDK 17+ and MySQL running on `localhost:3306`.

Easiest: double-click **`run.cmd`** (it checks prerequisites and opens the browser). Or:

```sh
cd backend
./mvnw spring-boot:run      # Windows cmd: mvnw.cmd spring-boot:run
```

Open http://localhost:8082/ and log in as `admin` / `admin123`, or sign up as a client or assistant. On first start the app creates the `manfriday` database and its tables, and seeds the admin account.

Configuration (environment variables, defaults shown):

| Variable | Default |
|---|---|
| `DB_URL` | `jdbc:mysql://localhost:3306/manfriday?createDatabaseIfNotExist=true...` |
| `DB_USERNAME` / `DB_PASSWORD` | `root` / `admin` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin123` |
| `SERVER_PORT` | `8082` |

## Demo data and video

Run these from the project root while the app is running:

```sh
npm run seed     # adds sample users and errands (safe to rerun)
npm run demo     # records docs/demo/man-friday-demo.mp4 (needs ffmpeg on PATH, or FFMPEG=path)
```

Sample accounts (password `demo1234`):

| Username | Role | Notes |
|---|---|---|
| `priya.sharma`, `rahul.verma`, `anita.desai` | Client | Errands in every status: open, accepted, in progress, completed, cancelled, rejected |
| `ravi.kumar` | Assistant | electronics, TV repair, appliances |
| `meena.iyer` | Assistant | paperwork, government offices, notary |
| `arjun.singh` | Assistant | driving, deliveries, shopping |

## Frontend

| Page | Who | What it does |
|---|---|---|
| `index.html` | everyone | Landing page with log in / sign up (client or assistant, optional skills) |
| `client.html` | clients | Post errands by category, track each one on a progress bar, cancel before work starts, filter Active / Completed / Closed |
| `assistant.html` | assistants | Browse open errands (filter by category), accept or skip, start and complete accepted work, see history |
| `admin.html` | admins | Stats, search (`#12` finds by id) and filter all errands, change any status, browse users with activity counts |

Pages refresh themselves every 10 to 15 seconds and show a notification when something changes (for example "Errand #4 was accepted by bob"). They work on phones and follow the system light/dark theme.

## Test

```sh
cd backend && ./mvnw test   # backend integration tests (in-memory H2, no MySQL needed)
npm run e2e                # browser end-to-end test against http://localhost:8082 (app must be running)
```

The browser test needs Node 22+ and Chrome or Edge (set `CHROME_PATH` if it isn't found). It drives a headless browser through every role's journey (69 checks) and saves screenshots to `e2e/screenshots/`. It creates uniquely named users and errands, so it is safe to rerun, but they stay in the database. To keep test data out of your real data, start a second instance on its own database and point the test at it:

```sh
cd backend && ./mvnw package -DskipTests
SERVER_PORT=8090 DB_URL="jdbc:mysql://localhost:3306/manfriday_e2e?createDatabaseIfNotExist=true&allowPublicKeyRetrieval=true&useSSL=false" java -jar target/manfriday-0.0.1-SNAPSHOT.jar
# in another terminal, from the project root:
npm run e2e -- http://localhost:8090
```

## Workflow

```
PUBLISHED --(assistant accepts)--> ASSISTANT_ACCEPTED --(start)--> IN_PROGRESS --(complete)--> COMPLETED
    \______________________ client cancels ______________________/
                     -> CANCELLED          (admin may set any status, e.g. REJECTED)
```

An assistant who declines a job just stops seeing it; it stays open for other assistants.

## API

All endpoints except register use HTTP Basic auth. Errors return `{"status": <code>, "error": "<message>"}`.

| Method | Path | Role |
|---|---|---|
| POST | `/api/auth/register` `{username,password,role,skills}` | public (CLIENT or ASSISTANT) |
| GET | `/api/auth/me` | any |
| POST | `/api/jobs` `{category,instructions}` | CLIENT |
| GET | `/api/jobs/mine` | CLIENT |
| POST | `/api/jobs/{id}/cancel` | CLIENT |
| GET | `/api/jobs/available` | ASSISTANT |
| GET | `/api/jobs/assigned` | ASSISTANT |
| POST | `/api/jobs/{id}/response?accept=true\|false` | ASSISTANT |
| POST | `/api/jobs/{id}/start`, `/api/jobs/{id}/complete` | ASSISTANT |
| GET | `/api/jobs/admin/all` | ADMIN |
| PUT | `/api/jobs/admin/{id}/status?status=...` | ADMIN |
| GET | `/api/admin/users` | ADMIN |
| GET | `/health` | public |

Categories: `TV_REPAIR`, `DOCUMENT_SUBMISSION`, `GROCERY_SHOPPING`, `BILL_PAYMENT`, `PARCEL_PICKUP`, `OTHER`.

## Security note

HTTP Basic sends credentials with every request. That's fine on localhost, but put the app behind HTTPS (or switch to JWT/session login) before exposing it on a network.

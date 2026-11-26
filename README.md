# PeopleDesk — Real-Time Employee Management System

PeopleDesk is a multi-user employee management app. Several people can work at the same time, and every change shows up on everyone else's screen immediately, without refreshing.

| Layer | Technology |
|---|---|
| Frontend | Vite, React 19, TypeScript, TanStack Router / Query / Table, Socket.IO client, Axios, Tailwind CSS 4, React Hook Form, Zod |
| Backend | Python 3.12+, FastAPI, **python-socketio** (`AsyncServer`, ASGI), Uvicorn, SQLAlchemy 2 (async), asyncpg, Alembic, Pydantic v2, PyJWT, pwdlib + bcrypt |
| Database | PostgreSQL 16 (Docker Compose) |

```
        FRONTEND  React + Vite + TypeScript
        TanStack Router / Query / Table · Socket.IO client
                       |
          HTTP REST  +  Socket.IO (polling ⇄ WebSocket)
                       |
        BACKEND   FastAPI  +  python-socketio AsyncServer
                       |
        JWT + role-based access (same check for REST and Socket.IO)
                       |
        Services (business logic, transactions)
                       |
        SQLAlchemy async  ->  PostgreSQL (Docker)
```

## Contents

1. [What was tested](#1-what-was-tested-and-what-was-not)
2. [Required software](#2-required-software)
3. [Project structure](#3-project-structure)
4. [Quick start on Windows](#4-quick-start-on-windows-powershell)
5. [Quick start on macOS / Linux](#5-quick-start-on-macos--linux)
6. [Configuration](#6-configuration-reference)
7. [Using the application](#7-using-the-application)
8. [Manual test scenarios (Tests 1–8)](#8-manual-test-scenarios)
9. [Automated tests](#9-automated-tests)
10. [How the real-time layer works](#10-how-the-real-time-layer-works)
11. [API overview](#11-api-overview)
12. [Security considerations](#12-security-considerations)
13. [Scaling and production deployment](#13-scaling-and-production-deployment)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. What was tested (and what was not)

**Automated, executed during development**

* Backend: 60 pytest tests against a real PostgreSQL database (auth, rate limiting, RBAC/403, validation, case-insensitive uniqueness, pagination/search/sort, optimistic locking including a 6-way concurrent race, transactional activity logging, and Socket.IO with real server + real clients).
* Frontend: 16 unit tests for the real-time cache logic (de-duplication, version ordering, filter/sort handling), TypeScript type-check, production build.
* **End-to-end in real Chromium with two or more independent browser sessions** — 48 checks covering Tests 1–8 below, including: live employee create/edit sync in both directions, live activity feed, HTTP 403 for a normal user on `/api/users`, HTTP 409 and the conflict UI, forced polling-only mode, a simulated firewall that blocks WebSocket (the app falls back to polling and keeps syncing), network drop, backend restart, and PostgreSQL restart with data intact.

**Not tested in the build environment — please check on your machine**

* **`docker compose up -d postgres` was not executed.** The build sandbox had no Docker daemon access and could not pull images, so PostgreSQL 16 was run natively there instead. `docker-compose.yml` was validated with `docker compose config` (syntax only). It is a standard `postgres:16-alpine` service, but its first real run will be on your machine.
* The Redis-backed multi-instance mode (`SOCKETIO_REDIS_URL`) is implemented but was not run (no Redis available).
* Windows itself was not available; the Windows instructions are written for PowerShell and use only cross-platform tools, but they have not been executed on Windows.
* Browsers other than Chromium were not tried.

## 2. Required software

| Software | Version | Notes |
|---|---|---|
| Docker Desktop (with Compose v2) | recent | Runs PostgreSQL. On Windows use the WSL 2 backend. |
| Python | 3.12 or newer | Developed with 3.13. |
| Node.js + npm | 22 LTS (≥ 20.19) | Vite 8 needs a recent Node. |
| A modern browser | Chrome / Edge / Firefox | |

Free ports: **5432** (PostgreSQL), **8000** (API), **5173** (frontend). If you already run PostgreSQL locally on 5432, set `POSTGRES_PORT=5433` in the root `.env` and use 5433 in `DATABASE_URL`.

## 3. Project structure

```
peopledesk/
├── docker-compose.yml          PostgreSQL service (health check, named volume)
├── .env.example                -> copy to .env (database name/user/password for Docker)
├── README.md
├── backend/
│   ├── .env.example            -> copy to .env
│   ├── requirements.txt        runtime dependencies
│   ├── requirements-dev.txt    + pytest, httpx, aiohttp
│   ├── alembic.ini · alembic/  migrations (async env, 0001 = initial schema)
│   ├── pytest.ini · tests/     pytest suite (real PostgreSQL)
│   └── app/
│       ├── main.py             ASGI entry: socketio.ASGIApp wrapping FastAPI
│       ├── core/               config, security (JWT/bcrypt), dependencies (auth/RBAC),
│       │                       exceptions (central handlers), rate_limit
│       ├── database/           base, async session, init_db (admin seeding)
│       ├── models/             user, employee, activity (SQLAlchemy 2)
│       ├── schemas/            Pydantic v2 request/response models
│       ├── services/           business logic + transactions (no HTTP/Socket.IO here)
│       ├── api/                router + endpoints (thin: validate, call service, broadcast)
│       ├── sockets/            server, auth (JWT on connect), events (rooms/handlers/broadcast)
│       └── utils/pagination.py
└── frontend/
    ├── .env.example            -> optional; defaults point at localhost:8000
    ├── package.json · vite.config.ts · tsconfig.json
    └── src/
        ├── main.tsx · App.tsx · router.ts
        ├── routes/             TanStack Router file routes (__root, login, _authed layout, employees, activities, users)
        ├── components/         layout/, employees/, users/, activities/, auth/, common/
        ├── hooks/              useAuth, useEmployees, useUsers, useActivities, useSocket
        ├── lib/                api (Axios), socket, auth (token), queryClient, realtimeCache (+ tests)
        ├── schemas/            Zod schemas
        └── types/ · utils/
```

## 4. Quick start on Windows (PowerShell)

Open **three** PowerShell windows (database/commands, backend, frontend), starting in the project folder.

### Step 1 — PostgreSQL (Docker)

Start Docker Desktop, then:

```powershell
copy .env.example .env
docker compose up -d postgres
docker compose ps          # wait until STATUS shows "healthy" (about 10–20 s)
```

Useful commands:

```powershell
docker compose stop postgres          # stop (data is kept in the named volume)
docker compose start postgres         # start again
docker compose logs -f postgres       # follow logs
docker compose down                   # remove container, KEEP data
docker compose down -v                # remove container AND DELETE all data
```

### Step 2 — Backend

```powershell
cd backend
py -3.12 -m venv .venv            # or: python -m venv .venv
.venv\Scripts\Activate.ps1
```

If PowerShell refuses to run the activation script ("running scripts is disabled"), run this once and retry:
`Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

```powershell
pip install -r requirements.txt
copy .env.example .env
```

Generate a JWT secret and put it in `backend\.env` as `JWT_SECRET=`:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Create the tables and the default administrator, then start the API:

```powershell
alembic upgrade head
python -m app.database.init_db       # creates admin / Admin@123 only if there are no users
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

(The administrator is also created automatically on startup when the users table is empty — `SEED_ADMIN_ON_STARTUP=true` — so running `init_db` is optional.)

Check: <http://localhost:8000/health> returns `{"status":"ok"}`; Swagger UI is at <http://localhost:8000/docs>.

### Step 3 — Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open **<http://localhost:5173>** and sign in with `admin` / `Admin@123`.

> Frontend configuration is optional: the defaults (`http://localhost:8000`) already match the backend. To change them, copy `frontend\.env.example` to `frontend\.env`.

## 5. Quick start on macOS / Linux

```bash
cp .env.example .env
docker compose up -d postgres

cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then set JWT_SECRET (see above)
alembic upgrade head
python -m app.database.init_db
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# second terminal
cd frontend && npm install && npm run dev
```

## 6. Configuration reference

**`.env` (project root)** — read only by Docker Compose: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`. These must match `DATABASE_URL` in `backend/.env`. Real secrets are never committed (`.env` is git-ignored).

**`backend/.env`**

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | `production` makes a weak/placeholder `JWT_SECRET` a startup error |
| `DATABASE_URL` | — | `postgresql+asyncpg://user:pass@host:5432/db` |
| `JWT_SECRET` | — (required) | Signing key. ≥ 32 random characters |
| `JWT_ALGORITHM` | `HS256` | |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` | Token lifetime |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated; used for REST **and** Socket.IO |
| `LOGIN_RATE_LIMIT_ATTEMPTS` / `_WINDOW_SECONDS` | `5` / `900` | Failed logins allowed per username (per-IP limit is 4× this) |
| `SEED_ADMIN_ON_STARTUP`, `SEED_ADMIN_USERNAME/_DISPLAY_NAME/_PASSWORD` | `true`, `admin`, …, `Admin@123` | Default administrator, only created when no users exist |
| `DB_POOL_SIZE`, `DB_MAX_OVERFLOW` | `10`, `10` | Connection pool |
| `BCRYPT_ROUNDS` | `12` | |
| `SOCKETIO_REDIS_URL` | empty | Enables the Redis message queue for multiple instances |

**`frontend/.env`** (optional) — `VITE_API_URL`, `VITE_SOCKET_URL`, `VITE_SOCKET_TRANSPORTS` (`polling,websocket` default).

## 7. Using the application

* **Login** — username + password. Wrong credentials show *"Invalid username or password."*; after 5 failed attempts for a username the API answers 429 with a retry time. The header shows your name, role, live connection status and **Logout** (with confirmation).
* **Employee Master** (everyone) — search (name, title, department, `EMP-000012` or `12`), department filter, click column headers to sort, page size and pagination, **Add employee**, **Edit**. Columns: Employee ID (auto-generated), Name, Department, Job title, Created, Last updated, Updated by. Rows changed by *someone else* flash briefly.
* **User Activity** (**admins only**; normal users get no menu item, are redirected, and the API returns 403) — the latest 100 actions, newest first: login, logout, user created, employee created/updated. New rows appear live.
* **User Master** (admins only) — list users; **Add user** (display name, username, password, role). The password is hashed with bcrypt; after creation the details are shown. Usernames are unique case-insensitively. Creating an administrator asks for confirmation.
* **Creating more users** — sign in as `admin` → User Master → Add user. Password rules: 8–72 characters with upper-case, lower-case and a digit.

## 8. Manual test scenarios

Prerequisites: PostgreSQL, backend and frontend running; `admin` / `Admin@123` available. Use two browsers, or one normal window plus one **incognito/private** window — each tab/window keeps its own session (the token is stored per tab).

**Test 1 — Authentication**
1. Open <http://localhost:5173/employees> while signed out → you are redirected to `/login`.
2. Enter a wrong password → *"Invalid username or password."*
3. Sign in as `admin` / `Admin@123` → dashboard opens; header shows *Administrator*, role *Admin*, status *Live*.
4. Click **Logout** → confirm → login page. Browse to `/employees` again → redirected to `/login`.

**Test 2 — User Master and 403**
1. As admin open **User Master** → **Add user**: display name `Test User`, username `testuser`, password `TestUser@123`, role *User* → *User created* panel appears.
2. In a second browser / incognito window sign in as `testuser` → the sidebar has **no** User Master; opening `/users` redirects to Employee Master.
3. In that window open DevTools → Console and run:
   ```js
   fetch('http://localhost:8000/api/users', {headers: {Authorization: 'Bearer ' + sessionStorage.getItem('pd_token')}}).then(r => r.status)
   ```
   → `403`. Also try `POST` to the same URL → `403`. (Or use Swagger at `/docs` → Authorize with the token.)

**Test 3 — Real-time employee sync**
1. Browser 1 = admin, Browser 2 = testuser; both on **Employee Master**.
2. Browser 1: **Add employee** (e.g. Grace Hopper / Engineering / Rear Admiral) → it appears in Browser 2 immediately (highlighted), no refresh.
3. Browser 2: **Edit** that employee, change the title → Browser 1 shows the new title immediately, with *Updated by* = Test User.

**Test 4 — Real-time activity** (User Activity is admin-only, so both watchers must be admins)
1. Browser 1 = admin on **User Activity**. Browser 2 = a normal user on **Employee Master**. (A normal user has no User Activity menu; `/api/activities` returns 403.)
2. In Browser 2 edit or create an employee → a new *Employee updated/created* row (username = that user) appears at the top of Browser 1's User Activity immediately. Saving an edit without changing any field records nothing.
3. Persistence check (optional, SQL): `docker compose exec postgres psql -U appuser -d employee_db -c "select id, username, action, details from activity_logs order by id desc limit 5;"`

**Test 5 — Concurrent update (HTTP 409)**
1. Both browsers on Employee Master. Open **Edit** for the *same* employee in both.
2. Browser 1: change the title → **Save changes**.
3. Browser 2 (still open): a yellow banner *"This employee was just updated"* appears live. Ignore it, change the name → **Save changes**.
4. Browser 2 shows *"Your changes were not saved — <user> modified this employee…"* (the request returned **HTTP 409**; DevTools → Network shows it), the form is reloaded with the latest data, and your unsaved text is shown for reference. Save again → succeeds with the new version.

**Test 6 — Transport fallback**
* *WebSocket (default)*: after login the header badge reads **Live · websocket** (the client starts on long-polling and upgrades). DevTools → Network → *WS* shows a `socket.io` connection.
* *Polling only*: open `http://localhost:5173/login?transports=polling`, sign in. The badge reads **Live · polling**, no WS connection appears in the Network tab, and Test 3 still works. (Equivalent to a proxy that blocks WebSocket.)
* *Restore*: open `http://localhost:5173/employees?transports=reset` → the badge returns to **Live · websocket**.
* *Alternative:* set `VITE_SOCKET_TRANSPORTS=polling` (or `websocket`) in `frontend/.env` and restart `npm run dev`.

**Test 7 — Reconnection**
1. With Browser 2 on Employee Master, stop the backend (Ctrl+C in its window). The badge changes to **Reconnecting…** (it keeps retrying with back-off).
2. Restart the backend (`uvicorn …`). The badge returns to **Live** by itself; create an employee in Browser 1 → it appears in Browser 2.
3. Missed changes: in Browser 2 open DevTools → Network → *Offline*; create an employee in Browser 1; switch Browser 2 back to *Online*. The badge shows *Offline* immediately, then *Live*, and the missed employee appears without a manual refresh (the list is refetched after reconnecting).

**Test 8 — Persistence**
1. Create a user, a few employees and some activity.
2. Restart the backend (Ctrl+C, start again) and PostgreSQL (`docker compose restart postgres`; wait for *healthy*).
3. Reload the browser (your session survives a reload) or sign in again → all users, employees and activity are still there. Data survives `docker compose stop`/`start` and `down` (not `down -v`).

## 9. Automated tests

```powershell
# Backend (needs PostgreSQL running; creates/uses the database employee_db_test, built via Alembic)
cd backend
pip install -r requirements-dev.txt
pytest -q

# Frontend
cd frontend
npm test            # unit tests (real-time cache logic)
npm run typecheck
npm run build       # type-check + production build
```

The backend tests use the same PostgreSQL server (user needs `CREATEDB`, which the Docker user has). Override with `TEST_DATABASE_URL`. They never touch your development database.

## 10. How the real-time layer works

* **One Socket.IO server** (`python-socketio` `AsyncServer`, `async_mode="asgi"`) is mounted with `socketio.ASGIApp` around the FastAPI app: `/socket.io/*` → Socket.IO, everything else → FastAPI. No custom WebSockets.
* **Authentication:** the client sends the JWT in the Socket.IO `auth` payload. On connect the server verifies the signature and expiry, loads the user from PostgreSQL (must exist and be active) and stores *that* identity in the connection session. Anything else the client claims (user id, role) is ignored. Missing/invalid/expired tokens are refused (`connect_error`). Open connections are closed when their token expires (`auth:expired`).
* **Rooms:** clients send `employee:subscribe` / `activity:subscribe` while the matching page is open, joining `employee_master` / `activity_viewers`; the `*:unsubscribe` events leave them.
* **Persist first, then broadcast:** services commit the employee/user change **and** its activity row in one transaction; only after the commit does the API layer emit `employee:created`, `employee:updated` and `activity:new`. Failed requests (validation, 409, errors) never broadcast. A broadcast failure never turns a committed change into an HTTP error.
* **Client cache:** events are merged into TanStack Query with `realtimeCache.ts`: idempotent by `version` (your own change arrives twice — REST response + broadcast — and is applied once), never rolls data back, patches in place when the result is certain, otherwise marks the query for refetch. No polling anywhere.
* **Reconnect:** Socket.IO reconnects with exponential back-off (retries forever, always sending the *current* token). After each reconnect the page re-joins its room and, once the server confirms, refetches its queries so nothing missed while offline is lost. The browser's `offline`/`online` events update the status badge immediately.
* **Transports:** `polling` then `websocket` (upgrade). Polling is never disabled by default.

## 11. API overview

Interactive docs: <http://localhost:8000/docs>. Errors always look like `{"error": {"code", "message", "details"}}`.

| Method & path | Access | Notes |
|---|---|---|
| `POST /api/auth/login` | public | rate-limited; returns token + user |
| `GET /api/auth/me` · `POST /api/auth/logout` | any user | logout records the activity |
| `GET /api/employees` | any user | `page`, `page_size`, `search`, `department`, `sort_by`, `sort_dir` |
| `GET /api/employees/departments` · `GET /api/employees/{id}` | any user | |
| `POST /api/employees` | any user | 201 |
| `PUT /api/employees/{id}` | any user | body includes `version`; stale → **409** `version_conflict` with the latest record in `details.current` |
| `GET /api/users` · `POST /api/users` | **admin only** (403 otherwise) | |
| `GET /api/activities` | **admin only** (403 otherwise) | latest 100, newest first |
| `GET /health` | public | DB check |

Database: `users` (case-insensitive unique index on `lower(username)`, role check), `employees` (`version`, `updated_by` FK), `activity_logs` (indexed on `created_at DESC, id DESC`, `user_id`, `action`). Schema is managed by Alembic (`alembic upgrade head`); the app never creates tables itself.

## 12. Security considerations

Implemented: bcrypt hashing (never returned by any API), JWT with expiry and re-validation of the user (active, exists) on every REST call and Socket.IO connection, server-side RBAC (`403`), Pydantic validation, parameterised queries (search wildcards escaped, sort columns whitelisted), CORS allow-list, login rate limiting (per username and per IP; constant-time-ish handling for unknown users), secrets only from environment (production refuses a weak `JWT_SECRET`), centralized error handling without stack traces.

Things to decide for production:

* **Token storage.** The token is kept in `sessionStorage` (per tab; gone when the tab closes). It is readable by JavaScript, so an XSS bug could steal it — keep dependencies patched and add a strict `Content-Security-Policy`. The alternative is an `HttpOnly; Secure; SameSite` cookie, which JavaScript cannot read but then needs **CSRF protection** (SameSite + CSRF token). With the current `Authorization: Bearer` header design CSRF does not apply.
* **HTTPS everywhere.** Terminate TLS at a reverse proxy; use `wss://`; never send tokens over plain HTTP outside local development.
* **Short-lived access tokens + refresh tokens.** The demo issues one 8-hour token. For production use ~15 min access tokens and rotating refresh tokens (stored server-side, hashed, revocable; ideally in an HttpOnly cookie).
* **Logout and revocation.** JWTs are stateless: `POST /api/auth/logout` records the event and the client discards the token, but a copied token stays valid until it expires. To revoke immediately, add a per-user `token_version` (or a `jti` deny-list in Redis) and check it in `get_active_user` — the single place every request and socket goes through. Disabling a user (`is_active=false`) already takes effect immediately.
* **Rate limiting** is in-memory per process. Behind a proxy make sure the real client IP reaches the app (`--proxy-headers` / forwarded-IP configuration), and use Redis for counters when running several instances.
* **Default admin.** Change `Admin@123` immediately outside demos (set `SEED_ADMIN_PASSWORD` before the first start, or change it after).
* Consider account lockout notifications, password-change/reset flows and MFA.

## 13. Scaling and production deployment

* **Several backend instances.** Socket.IO rooms and connection lists live in process memory. With more than one process you **must** share them: set `SOCKETIO_REDIS_URL=redis://redis:6379/0` (already wired to `socketio.AsyncRedisManager`; `redis` is in `requirements.txt`). Then an event emitted by instance A reaches clients connected to instance B. Run `uvicorn --workers N` or multiple containers only with Redis configured.
* **Sticky sessions.** HTTP long-polling requests of one Socket.IO session must reach the same instance. Use sticky routing (nginx `ip_hash`, cookie stickiness) — or force `transports: ['websocket']` on clients when polling fallback is not needed. (Keep polling for hostile corporate networks.)
* **Reverse proxy (nginx) with HTTPS** — sketch:
  ```nginx
  server {
    listen 443 ssl http2;
    server_name peopledesk.example.com;
    ssl_certificate     /etc/ssl/fullchain.pem;
    ssl_certificate_key /etc/ssl/privkey.pem;

    location /            { root /var/www/peopledesk; try_files $uri /index.html; }   # built frontend
    location /api/        { proxy_pass http://backend_pool; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; }
    location /socket.io/  {
      proxy_pass http://backend_pool;                       # upstream with ip_hash;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_read_timeout 120s;
    }
  }
  ```
  Serving the frontend and API from one origin also removes CORS configuration; build the frontend with `VITE_API_URL=` and `VITE_SOCKET_URL=` set to that origin.
* **Dockerizing.** Backend image: `python:3.12-slim`, `pip install -r requirements.txt`, run `alembic upgrade head` as a release step, then `uvicorn app.main:app --host 0.0.0.0 --port 8000`. Frontend: build with `npm ci && npm run build` and serve `dist/` from nginx. Add both as services next to `postgres` (and `redis`) in Compose. *(Not included or tested here — the brief asks for Docker only for PostgreSQL.)*
* **PostgreSQL connection pooling.** `DB_POOL_SIZE` + `DB_MAX_OVERFLOW` size the per-process pool (`pool_pre_ping` recovers from DB restarts). Total connections ≈ instances × workers × (pool + overflow); keep that under PostgreSQL's `max_connections` or place PgBouncer (transaction pooling) in front.
* **Role/permission expansion.** All authorization goes through `core/dependencies.py` (`CurrentUser`, `AdminUser`) and `sockets/events.py::ROOM_ROLES`. Add roles to the `role` check constraint (new Alembic migration), then replace `AdminUser` with a `require_permission("employees:delete")`-style dependency and map roles → permissions in one table.
* **More master data modules.** Copy the pattern: model → Alembic migration → schema → service (transaction + `record_activity`) → endpoint → broadcast helper in `sockets/events.py` → a room + frontend route/hook using `useSocketRoom` and `realtimeCache`.

## 14. Troubleshooting

| Symptom | Fix |
|---|---|
| `docker: command not found` / *cannot connect to the Docker daemon* | Start Docker Desktop and wait until it says *running*. |
| `port is already allocated` (5432) | Another PostgreSQL uses 5432. Set `POSTGRES_PORT=5433` in root `.env`, and use `:5433` in `DATABASE_URL`. |
| `password authentication failed for user "appuser"` | `backend/.env` credentials differ from root `.env`. If you changed the root password *after* the first start, the volume keeps the old one: `docker compose down -v` (deletes data) and start again. |
| `ConnectionRefusedError` / `Connect call failed ('127.0.0.1', 5432)` | PostgreSQL is not up yet: `docker compose ps` must show *healthy*. |
| `ValidationError … DATABASE_URL / JWT_SECRET Field required` | `backend/.env` is missing — `copy .env.example .env`. |
| `alembic: command not found` | Activate the virtual environment first. |
| PowerShell: *running scripts is disabled* | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` |
| Login page: *Cannot reach the server* | Backend not running, or `VITE_API_URL` is wrong. Check <http://localhost:8000/health>. |
| Browser console: CORS error | The frontend origin is not in `CORS_ORIGINS` (e.g. you opened `http://127.0.0.1:5173`). Add it, comma-separated, and restart the backend. |
| Badge stuck on *Connecting…* / *Reconnecting…* | Backend down, or CORS/`VITE_SOCKET_URL` mismatch (see DevTools → Network → `socket.io`). |
| Badge says *Live · polling* and never *websocket* | A proxy/firewall blocks WebSocket — expected fallback; everything still works. |
| *Too many failed login attempts* | Wait the stated time, or restart the backend (limiter is in memory). |
| Edits fail with a "modified this employee" message | Working as designed: someone saved first. The latest data was loaded into the form; re-apply your change. |
| `npm install` errors on old Node | Upgrade to Node 22 LTS. |
| `pytest` can't create the test DB | The DB user needs `CREATEDB`, or create `employee_db_test` yourself, or set `TEST_DATABASE_URL`. |
| Reset everything | `docker compose down -v`, then repeat Step 1 and `alembic upgrade head`. |

Verified versions (development environment): Python 3.13, Node 22, PostgreSQL 16; FastAPI 0.165, python-socketio 5.18, SQLAlchemy 2.1, asyncpg 0.32, Alembic 1.20, Pydantic 2.14; React 19, Vite 8, TanStack Router 1.170 / Query 5.108 / Table 8.21, socket.io-client 4.8, Tailwind 4.3, TypeScript 7.

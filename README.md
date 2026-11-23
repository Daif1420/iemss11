# IEMS — Intercom Employee Management System

React + Vite frontend (`frontend/`) and an Express 5 API (`backend/`), deployed as a single Vercel project.
The API runs as a Vercel Node Function (`api/index.js` → `backend/server.js`) on PostgreSQL, with JWT + bcrypt auth.

## Environment variables (Vercel → Settings → Environment Variables)

| Name | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | Long random string. There is no fallback in production |
| `PG_POOL_MAX` | no | Default `5` |

In production the API refuses to start without `DATABASE_URL`. `GET /api/health` reports whether both variables are set.

## Database

The schema is created automatically on the first request after a cold start:
`backend/database/init.js` runs `backend/database/bootstrap.sql` under a Postgres advisory lock.
There is no database step in the build.

A protected system-creator account (ID `0`) is created with `must_change_password = TRUE`.

## Excel import

`stage_daily` rows are inserted in batches of 500 to avoid statement timeouts. Each stage's monthly target is read from
the `Master!AO` formula and stored in `employee_stage_targets` (employee × shift × payroll cycle).

## Local development

```bash
cp .env.example .env     # leave DATABASE_URL empty to use the in-memory mock DB
npm install              # also installs frontend deps (postinstall)
node backend/server.js   # API on :3000
npm --prefix frontend run dev   # frontend on :5173, proxies /api to :3000
```

Checks: `npm run lint`, `npm --prefix frontend run typecheck`, `npm run build`.

## Routing

Routes are literal `.html` paths (`/home.html`, `/reports.html`, …). `vercel.json` rewrites them to `/index.html`
for React Router and `/api/*` to the function; `frontend/vite.config.ts` does the same for `npm run dev`.

## Roles

| Page | Allowed roles |
| --- | --- |
| Home | all signed-in users |
| Employees, Import, Reports | `supervisor`, `admin`, `system_creator` |
| Manual entry | `admin`, `system_creator` |
| Audit logs, Themes | `system_creator` |

Permissions are enforced in `backend/middleware/auth.js` and mirrored in `frontend/src/components/layout/AppShell.tsx`.

Never commit `.env` files or a real `JWT_SECRET`.

# IEMS — Vercel Edition

Single Vercel deployment:

- React + Vite frontend (`frontend/`)
- Express 5 API running as a Vercel Node Function (`api/index.js` -> `backend/server.js`)
- PostgreSQL via `pg`, JWT + bcrypt auth

## Required Vercel environment variables

```text
DATABASE_URL=your PostgreSQL connection string
JWT_SECRET=a-long-random-secret
NODE_ENV=production
```

Both are checked at runtime and produce a clear JSON error if missing.
`GET /api/health` reports whether each one is set and works even when they
aren't — use it first when diagnosing a deployment.

## How the schema is created

The API creates its own schema on the first request after a cold start:
`backend/database/init.js` runs `backend/database/bootstrap.sql` under a
Postgres advisory lock, so concurrent serverless invocations can't race. There
is no database step in the build.

> The `database/` folder only holds `initial-data.json`: seed data for the
> in-memory mock database used when `DATABASE_URL` is unset (loaded by
> `backend/database/mock-db.js`).

## Master Excel import

`stage_daily` rows are inserted in PostgreSQL batches of 500 to avoid statement
timeouts. Each stage's monthly target is read from the formula in `Master!AO`
and stored in `employee_stage_targets` by employee, shift and payroll cycle.

## Routing

The app's routes are literal `.html` filenames (`/home.html`, `/reports.html`, ...)
because the app's redirects and active-nav check use them. `vercel.json` rewrites each one to `/index.html` so React Router can
handle it, and rewrites `/api/*` to the function. `frontend/vite.config.ts`
reproduces the same rewrites for `npm run dev`.

## Local development

```bash
npm install                 # API dependencies (root package.json)
npm --prefix frontend ci

node backend/server.js      # API on :3000
npm run dev                 # frontend on :5173, proxies /api to :3000
```

Set `VITE_API_TARGET` to point the dev proxy somewhere other than
`http://localhost:3000`.

## Roles

One permission table is applied in three places and they must stay in sync:
`frontend/src/components/layout/AppShell.tsx` (nav visibility), the `roles` of each route in `frontend/src/App.tsx`, and
the role middleware in `backend/middleware/auth.js`.

| Page | Allowed roles |
| --- | --- |
| Home | all signed-in users |
| Employees, Import, Reports | `supervisor`, `admin`, `system_creator` |
| Manual entry | `admin`, `system_creator` |
| Audit logs, Themes | `system_creator` |

## Styling

Styling uses Tailwind CSS v4; global tokens live in `frontend/src/styles/index.css`.

Do not commit `.env` files or a real `JWT_SECRET`.

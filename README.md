# IEMS — Intercom Employee Management System

- Frontend: React 19 + Vite + Tailwind (`frontend/`)
- API: Express 5 running as a Vercel Node Function (`api/index.js` → `backend/server.js`)
- Database: PostgreSQL (`pg`), JWT + bcrypt auth. Without `DATABASE_URL` the API uses an in-memory mock DB seeded from `database/initial-data.json`.

## Environment variables

See `.env.example`. In production `DATABASE_URL` and `JWT_SECRET` are required.
`GET /api/health` reports whether each one is set (works even when they aren't).

## Database

The schema is created automatically on the first request after a cold start:
`backend/database/init.js` runs `backend/database/bootstrap.sql` under a Postgres advisory lock.
`database/clean-production.sql` is a manual, one-time script that wipes imported data
(keeps only the primary admin) — run it by hand before the first clean import.

## Local development

```bash
npm install            # installs API deps, then frontend deps (postinstall)
node backend/server.js # API on :3000
npm --prefix frontend run dev   # frontend on :5173, proxies /api to :3000
```

Set `VITE_API_TARGET` to proxy somewhere other than `http://localhost:3000`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run build` | Type-check + production build of the frontend |
| `npm run lint` | oxlint on `frontend/src` |
| `npm start` | Serve API + built frontend |

## Routing

Routes are literal `.html` paths (`/home.html`, `/reports.html`, …). `vercel.json` rewrites each to
`/index.html` for React Router, and `/api/*` to the function. `frontend/vite.config.ts` does the same for dev.

## Roles

Permissions must stay in sync in three places: `frontend/src/components/layout/AppShell.tsx` (nav),
`ProtectedRoute` in `App.tsx`, and `backend/middleware/auth.js`.

## Import notes

The Master Excel import inserts `stage_daily` rows in batches of 500 (avoids statement timeouts) and stores each
stage's monthly target (from `Master!AO`) in `employee_stage_targets`.

Never commit `.env` files or a real `JWT_SECRET`.

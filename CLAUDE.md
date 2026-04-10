# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Running the project

**One-command start (recommended):**
```bash
./start.sh
```
This creates a Python venv, installs deps, runs Alembic migrations, then starts both servers concurrently. Backend at `:8000`, frontend at `:5173`.

**Separately:**
```bash
# Backend
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev          # dev server (proxies /api → :8000)
npm run build        # production build
npm run preview      # preview the dist/ build
```

**Database migrations:**
```bash
cd backend
.venv/bin/alembic upgrade head                        # apply all pending migrations
.venv/bin/alembic revision -m "describe change"       # create a new migration file
```
The app also auto-runs `alembic upgrade head` on startup via `@app.on_event("startup")` in `main.py`.

**API docs:** `http://localhost:8000/docs` (FastAPI auto-generated Swagger UI)

---

## Architecture overview

### Stack
- **Backend:** FastAPI + SQLAlchemy ORM + SQLite (WAL mode) + Alembic migrations + NumPy
- **Frontend:** React 18 + Vite + Tailwind CSS v3 + Chart.js via react-chartjs-2 + Axios
- **No test suite exists** — no `pytest` or vitest configured.

### Backend layout (`backend/`)

```
main.py        FastAPI app, all endpoints, startup migration hook
models.py      SQLAlchemy ORM: Department, SettingsVersion, Sample
schemas.py     Pydantic v2 request/response models
logic.py       Pure-function SQC engine (no DB access)
database.py    Engine + session factory (SQLite WAL, FK enforcement)
alembic/       Migration scripts (versions/001_…, 002_…)
```

**Key architectural decisions:**

**Immutable settings snapshots** — `SettingsVersion` is an append-only table. Every `Sample` carries a FK to the version in effect at save time. This means historical Cpk/USL/LSL in the data log always reflect the rules that were active when the batch was recorded, regardless of subsequent settings changes. Never mutate a `SettingsVersion` row.

**Denormalised fast columns** — `Sample` stores `mean_hank`, `readings_count`, and `cv_pct` as computed columns at write time. The overview and data log endpoints query only these columns — `readings_json` (the full array blob) is only parsed for single-sample detail, chart rendering, and CSV export.

**`logic.py` is the stats engine** — all SQC calculations (Cpk, Cp, WE rules, control limits, Index of Irregularity, upstream CV prediction) live here as pure functions. Never put business logic in endpoints.

**WE Rules operate on batch means** — `detect_we_violations()` in `logic.py` expects an array of `mean_hank` values (one per batch), not individual readings. The overview endpoint feeds it `_batch_means()` which queries only `Sample.mean_hank`.

**Ne hank formula:** `Ne = (L_yards × 0.54) / W_grams`  — both `logic.py` and `api.js` mirror this calculation.

### Frontend layout (`frontend/src/`)

```
App.jsx                      Root state, view routing, MachineFilterBar
api.js                       All Axios calls (single source of truth for backend URLs)
components/
  Layout.jsx                 Sidebar nav (draggable, localStorage order), header
  Primitives.jsx             Design-system atoms: Badge, Btn, Card, Alert, Metric, Spinner…
  views/
    DataEntry.jsx            Readings form + ResultCallout animated card
    ControlCharts.jsx        X-bar chart (Chart.js) + histogram + time-range filter
    DataLog.jsx              Sortable batch table with snapshot target columns
    Overview.jsx             KPI tiles + WE rule alerts
    Settings.jsx             Target/tolerance editor
    ShiftReport.jsx
    UsterBenchmarks.jsx
    OperatorGuide.jsx
```

**State lives in `App.jsx`** — `currentDept`, `machineFilter`, `overview`, `depts`, `alerts` are all top-level. Views receive them as props; nothing uses React Context or a state library.

**`MACHINE_CONFIG` is the source of truth** for which departments have machine/frame tracking and how many machines they have. It is exported from `App.jsx` and imported by `DataEntry`, `DataLog`, and `ControlCharts`. Do not duplicate these values.

```js
// App.jsx
export const MACHINE_CONFIG = {
  ringframe: { max: 25, label: 'Frame #',   noun: 'Frame #'   },
  carding:   { max: 3,  label: 'Card #',    noun: 'Card #'    },
  simplex:   { max: 3,  label: 'Simplex #', noun: 'Simplex #' },
}
```

**`api.js` strips null/undefined params** — `getLog()` cleans the params object before passing to Axios so empty filters are never sent as `?frame_number=` in the query string.

### Design system (`src/index.css` + `Primitives.jsx`)

All colours are CSS custom properties on `:root`. Never hardcode hex values in components — use variables.

| Token group | Variables |
|---|---|
| Backgrounds | `--bg`, `--bg-2`, `--bg-3`, `--bg-hover`, `--bg-active` |
| Borders | `--bd`, `--bd-md`, `--bd-hv` |
| Text | `--tx`, `--tx-2`, `--tx-3`, `--tx-4` |
| Status | `--ok/--ok-bg/--ok-bd`, `--warn/…`, `--bad/…`, `--info/…` |
| Accent | `--claude`, `--claude-bg`, `--claude-bd` |
| Typography | `--font` (Styrene B), `--mono` (JetBrains Mono) |

Dark mode is automatic via `@media (prefers-color-scheme: dark)` — only token values change.

**Fonts are self-hosted** from `frontend/public/fonts/` (four Styrene B OTF weights: Thin/100, Regular/400, Medium/500, Black/900). JetBrains Mono loads from Google Fonts and is used exclusively for numerical/monospace values.

### Database schema (summary)

```
departments         — one row per dept, holds current mutable target/tolerance
settings_versions   — immutable snapshot per (dept, target, tolerance) triplet
samples             — one row per saved batch; FK → settings_versions
```

The six departments are seeded in `001_initial_schema.py` migration. Adding a 7th requires both a migration and an entry in `_DEPT_DEFAULTS` in that file.

### Adding a new migration

1. Edit `models.py` first.
2. Create `backend/alembic/versions/NNN_description.py` manually (auto-generation via `alembic revision --autogenerate` is unreliable with the current setup).
3. Use `op.get_bind()` + `sa.inspect(conn)` to make migrations idempotent (check column existence before `ADD COLUMN`).
4. Set `down_revision` to the previous revision ID.

### Decimal precision convention

- Hank/sliver departments (Carding, Breaker, RSB, Simplex): targets are `~0.12–1.12` → display 4 decimal places.
- Ne departments (Ring Frame, Autoconer): targets are `~47` → display 2 decimal places.
- `decimalPlaces(target)` in `api.js` and `decimal_places()` in `logic.py` both implement: `return 2 if target >= 10 else 4`.

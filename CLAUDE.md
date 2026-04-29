# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Running the project

**One-command start (recommended):**
```bash
./start.sh
```
Creates a Python venv, installs deps, runs Alembic migrations, then starts both servers concurrently. Backend at `:8000`, frontend at `:5173`.

**Separately:**
```bash
# Backend
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev        # dev server (proxies /api → :8000)
npm run build      # production build
```

**Database migrations:**
```bash
cd backend
.venv/bin/alembic upgrade head              # apply pending migrations
.venv/bin/alembic revision -m "describe"   # create new migration file (then edit manually)
```
The app also auto-runs `alembic upgrade head` on startup via `@app.on_event("startup")` in `main.py`.

**Quick import check (no DB needed):**
```bash
cd backend
PYTHONPATH=. python3 -c "import models; import schemas; print('OK')"
```

**API docs:** `http://localhost:8000/docs`

---

## Architecture overview

### Stack
- **Backend:** FastAPI + SQLAlchemy ORM + SQLite (local) / Supabase Postgres (production) + Alembic + NumPy
- **Frontend:** React 18 + Vite + Tailwind CSS v3 + Chart.js + Axios
- **No test suite** — no pytest or vitest configured.

### Three top-level modules

The UI has three independently routable modules, each with its own sidebar nav:

| Module | `currentModule` value | Root component | Sidebar nav |
|---|---|---|---|
| Quality | `'quality'` | views in `App.jsx` | `DEFAULT_NAV` in `Layout.jsx` |
| Production & Inventory | `'production'` | `InventoryPlanning`, `ProductionEntry`, `PurchaseFlow` | `OPERATIONS_NAV` in `Layout.jsx` |
| Master Data | `'masterdata'` | `MasterData.jsx` | `MASTERDATA_NAV` in `Layout.jsx` |

Module state (`currentModule`, `productionView`, `masterdataView`) lives in `App.jsx` and is passed down to `Layout` for shell-bar tab rendering. `null` = Landing page.

### Backend layout (`backend/`)

```
main.py        All FastAPI endpoints (~3 500 lines) + startup hook
models.py      SQLAlchemy ORM — all tables
schemas.py     Pydantic v2 request/response models
logic.py       Pure-function SQC engine (no DB access)
database.py    Engine + session factory (SQLite WAL / Supabase, FK enforcement)
alembic/versions/   001…018 migration scripts (always created manually)
```

### Key backend architectural rules

**Immutable settings snapshots** — `SettingsVersion` is append-only. Every `Sample` has a FK to the version in effect at save time. Never mutate a `SettingsVersion` row. Historical Cpk/USL/LSL always reflect the rules that were active when the batch was recorded.

**Denormalised fast columns on `Sample`** — `mean_hank`, `readings_count`, and `cv_pct` are computed and stored at write time. Overview and log endpoints query only these — `readings_json` is only parsed for single-sample detail, charts, and CSV export.

**`logic.py` is the stats engine** — all SQC calculations (Cpk, Cp, WE rules, control limits, Index of Irregularity, upstream CV prediction) live here as pure functions. Never put QC math in endpoints.

**WE Rules operate on batch means** — `detect_we_violations()` takes an array of `mean_hank` values (one per batch). The overview endpoint builds this via `_batch_means()` querying `Sample.mean_hank` directly.

**Inventory ledger is append-only** — stock is never directly edited. `InventoryMovement` rows are written first; `InventoryStock` is a cached aggregate updated as a side-effect. `_post_inventory_movement()` in `main.py` is the single write path.

**Ne hank formula:** `Ne = (L_yards × 0.54) / W_grams` — mirrored in both `logic.py` and `api.js`.

### Business Partner (BP) model — SAP-style

`BusinessPartner` is the unified entity for all external partners across modules. Roles are stored as explicit rows in `BPRole` (not boolean flags), so new roles can be added without schema changes.

| Role | Meaning |
|---|---|
| `MM_VENDOR` | Approved procurement supplier — required to post a Direct GR or create a PO |
| `FI_VENDOR` | Accounts payable (future FI module) |
| `FI_CUSTOMER` | Accounts receivable (future FI module) |
| `SD_CUSTOMER` | Sales customer (future SD module) |

**Enforcement:** `post_direct_gr` and `convert_recommendation_to_po` both validate that the selected BP has `MM_VENDOR` role before writing any transaction. `receive_purchase_order` re-validates at receive time. Blocked BPs are always rejected.

**`BPMaterial`** (`bp_materials` table) replaces the legacy `VendorMaterial` — it links a BP to a material and auto-updates `last_price`/`last_price_date` on each GR posting.

**`Vendor` and `VendorMaterial`** ORM classes are dead — their DB tables exist for historical reference only; no active relationship or endpoint uses them. All business logic uses `BusinessPartner`.

### Inventory / MRP data flow

```
POST /api/goods-receipts/direct  → validates BP (MM_VENDOR) → writes GoodsReceipt
                                  → _post_inventory_movement() → InventoryMovement
                                  → updates InventoryStock (cached aggregate)
                                  → _evaluate_mrp() → may create PurchaseRecommendation

POST /api/inventory/material-issues → writes MaterialIssueDocument
                                    → _post_inventory_movement() (negative delta)
                                    → updates InventoryStock
```

Negative stock is prevented at the GI endpoint — it checks `on_hand` before posting.

### Frontend layout (`frontend/src/`)

```
App.jsx                 Root state, module routing, MachineFilterBar
api.js                  Single source of truth for all backend calls
components/
  Layout.jsx            Shell bar (3 module tabs), collapsible sidebar, breadcrumb
  Primitives.jsx        Design-system atoms (Badge, Btn, Card, Spinner, …)
  views/
    MasterData.jsx      Business Partners + Material Master (SAP Fiori table style)
    InventoryPlanning.jsx  Stock, GR, GI, movements, MRP planning (Production module)
    PurchaseFlow.jsx    Purchase recommendations → PO conversion + receipt
    YarnLab.jsx         Lab trial flow (RSB → Simplex → Ringframe)
    DataEntry.jsx       QC readings form
    ControlCharts.jsx   X-bar chart + histogram
    DataLog.jsx         Sortable batch table with snapshot targets
    … (Overview, Settings, ShiftReport, UsterBenchmarks, OperatorGuide)
```

**State lives in `App.jsx`** — `currentDept`, `machineFilter`, `overview`, `depts`, `alerts`. Views receive them as props; nothing uses React Context or a state library.

**`MACHINE_CONFIG`** (exported from `App.jsx`) is the single source of truth for which departments have frame/machine tracking and how many. Import it; never duplicate the values.

**`api.js`** — the module-level `clean()` helper strips `null`/`undefined`/empty-string values before Axios sends them, preventing stray `?key=` query params. All API calls go through this file.

### Master Data UI (`MasterData.jsx`)

Renders in SAP Fiori compact table style. Key constants defined at the top of the file:

- `SAP_BLUE = '#0070f2'` — used for all codes (BP codes, material codes)
- `SAP_NAVY = '#354a5e'` — action buttons
- `MAT_TYPES` / `MAT_CATEGORIES` — two-level material taxonomy with dependent dropdowns; `MAT_CATEGORIES` is keyed by `MAT_TYPES` value
- `ALL_ROLES` / `ROLE_META` — BP role chips with colour coding per role

`MasterData` receives a `mode` prop: `'bp'` | `'materials'`.

### Design system (`src/index.css` + `Primitives.jsx`)

All colours are CSS custom properties on `:root`. Never hardcode hex in components outside of `MasterData.jsx` and `InventoryPlanning.jsx` (which use their own SAP Fiori tokens). Elsewhere, use:

| Token group | Variables |
|---|---|
| Backgrounds | `--bg`, `--bg-2`, `--bg-3`, `--bg-hover`, `--bg-active` |
| Borders | `--bd`, `--bd-md`, `--bd-hv` |
| Text | `--tx`, `--tx-2`, `--tx-3`, `--tx-4` |
| Status | `--ok/--ok-bg/--ok-bd`, `--warn/…`, `--bad/…`, `--info/…` |
| Accent | `--claude`, `--claude-bg`, `--claude-bd` |
| Typography | `--font` (Styrene B — self-hosted OTF), `--mono` (JetBrains Mono — Google Fonts) |

Dark mode is automatic via `@media (prefers-color-scheme: dark)` — only token values change.

### Database schema (summary)

**Quality:** `departments` → `settings_versions` → `samples`

**YarnLAB:** `lab_trials` → `lab_benchmarks`, `lab_samples`, `lab_rsb_cans` → `lab_simplex_inputs` → `lab_simplex_bobbins` → `lab_ringframe_inputs` → `lab_ringframe_cops`

**Production:** `production_std_rates`, `production_entries`

**Master Data:** `business_partners` → `bp_roles`, `bp_materials`; `materials` → `material_planning_params`, `material_market_prices`

**Inventory ledger:** `inventory_movements` (append-only) → `inventory_stock` (cached aggregate); `material_issue_documents` → `material_issue_lines`

**Purchasing:** `purchase_recommendations` → `purchase_orders` → `purchase_order_lines` → `goods_receipts` → `goods_receipt_lines`

**Legacy (dead, DB only):** `vendors`, `vendor_materials` — not used by any active code; kept for historical data.

Six departments are seeded in migration `001`. Adding a 7th requires both a migration and an entry in `_DEPT_DEFAULTS` in that file.

### Adding a new migration

1. Edit `models.py` first.
2. Create `backend/alembic/versions/NNN_description.py` **manually** — `alembic revision --autogenerate` is unreliable with this setup.
3. Use `op.get_bind()` + `sa.inspect(conn)` to make every DDL statement idempotent (check column/table existence before `ADD COLUMN` / `CREATE TABLE`).
4. Set `down_revision` to the previous revision ID string.
5. Use `is_pg = conn.dialect.name == 'postgresql'` to guard any Postgres-specific DDL (e.g. `ALTER COLUMN … SET NOT NULL`) that SQLite doesn't support.

Current head: **018** (`018_bp_material_and_po_bp.py`)

### Decimal precision convention

- Hank/sliver departments (Carding, Breaker, RSB, Simplex): targets `~0.12–1.12` → 4 decimal places.
- Ne departments (Ring Frame, Autoconer): targets `~47` → 2 decimal places.
- `decimalPlaces(target)` in `api.js` and `decimal_places()` in `logic.py` both implement: `return 2 if target >= 10 else 4`.

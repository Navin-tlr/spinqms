"""
main.py — SpinQMS FastAPI backend (production-grade)
=====================================================
Run with:  uvicorn main:app --reload --port 8000

Key changes from prototype:
  • Startup runs Alembic migrations instead of Base.metadata.create_all
  • Global exception handler returns structured JSON for all 5xx errors
  • /api/overview uses batch-mean queries (no JSON deserialization at scale)
  • WE Rule 4 evaluates full historical batch-mean array from DB
  • /api/depts and /api/overview are driven entirely from the departments table
  • SettingsVersion FK replaces duplicated snapshot floats on every Sample row
"""

from __future__ import annotations

import csv
import io
import json
import logging
import os
from datetime import date, datetime, timezone
from typing import Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import (
    Department,
    GoodsReceipt,
    GoodsReceiptLine,
    InventoryMovement,
    InventoryStock,
    LabBenchmark,
    LabRSBCan,
    LabRingframeCop,
    LabRingframeInput,
    LabSample,
    LabSimplexBobbin,
    LabSimplexInput,
    LabTrial,
    Material,
    MaterialIssueDocument,
    MaterialIssueLine,
    MaterialMarketPrice,
    MaterialPlanningParam,
    ProductionEntry,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseRecommendation,
    ProductionStdRate,
    Sample,
    SettingsVersion,
)
from schemas import (
    Alert,
    DeptKPI,
    ErrorResponse,
    IIRequest,
    IIResponse,
    LabBenchmarkItem,
    LabFlowResponse,
    RingframeCopCreate,
    RingframeCopUpdate,
    RingframeCopOut,
    RSBCanBulkSave,
    LabSampleCreate,
    RSBSection,
    LabTrialCreate,
    LabTrialUpdate,
    SimplexBobbinCreate,
    SimplexBobbinOut,
    SimplexBobbinUpdate,
    SimplexInputUpdate,
    SimplexInputOut,
    PredictRequest,
    ProductionDashboardOut,
    ProductionDeptSummary,
    ProductionEntryCreate,
    ProductionEntryOut,
    ProductionStdRateOut,
    ProductionStdRateUpdate,
    GoodsReceiptCreate,
    GoodsReceiptOut,
    QuickReceiptCreate,
    QuickReceiptOut,
    InventoryMovementOut,
    InventoryOverviewItem,
    MaterialMarketPriceCreate,
    MaterialMarketPriceOut,
    MaterialIssueCreate,
    MaterialIssueOut,
    MaterialCreate,
    MaterialOut,
    MaterialPlanningParamUpdate,
    PurchaseOrderCreate,
    PurchaseOrderOut,
    PurchaseRecommendationOut,
    SampleCreate,
    SampleOut,
    SampleUpdate,
    SettingsOut,
    SettingsUpdate,
)
import logic

logger = logging.getLogger("spinqms")
logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s — %(message)s")

# ── App init ──────────────────────────────────────────────────────────────────
app = FastAPI(
    title="SpinQMS API",
    version="2.0.0",
    description="Statistical Quality Control for Ne 47 weft yarn (spinning mill)",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://spinqms-frontend.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Global exception handler ──────────────────────────────────────────────────
@app.exception_handler(Exception)
async def _global_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch all unhandled errors and return structured JSON instead of 500 HTML."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            detail=str(exc) or "Internal server error",
            error_type=type(exc).__name__,
        ).model_dump(),
    )


@app.exception_handler(HTTPException)
async def _http_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(
            detail=exc.detail,
            error_type="HTTPException",
        ).model_dump(),
    )


# ── Startup: run Alembic migrations ──────────────────────────────────────────
@app.on_event("startup")
def startup() -> None:
    """
    Apply any pending Alembic migrations on startup.

    For Supabase / managed Postgres: the schema is pre-applied via MCP and the
    alembic_version table is stamped at head, so this becomes a fast no-op.
    The try/except ensures a misconfigured migration never prevents the app
    from starting — the error is logged and the app proceeds.
    """
    try:
        from alembic.config import Config
        from alembic import command

        ini_path = os.path.join(os.path.dirname(__file__), "alembic.ini")
        cfg = Config(ini_path)
        cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "alembic"))
        command.upgrade(cfg, "head")
        logger.info("Database migrations applied — schema at head")
    except Exception as exc:
        logger.warning("Alembic migration skipped on startup: %s", exc)


# ── Internal helpers ──────────────────────────────────────────────────────────
def _get_dept_or_404(dept_id: str, db: Session) -> Department:
    d = db.query(Department).filter_by(dept_id=dept_id).first()
    if not d:
        raise HTTPException(404, f"Department '{dept_id}' not found")
    return d


def _get_trial_or_404(trial_id: int, db: Session) -> LabTrial:
    t = db.query(LabTrial).filter_by(id=trial_id).first()
    if not t:
        raise HTTPException(404, "Trial not found")
    return t


def _ordered_depts(db: Session) -> List[Department]:
    """All departments in canonical pipeline order."""
    order = ["carding", "breaker", "rsb", "simplex", "ringframe", "autoconer"]
    rows  = {d.dept_id: d for d in db.query(Department).all()}
    return [rows[did] for did in order if did in rows]


def _get_or_create_version(dept: Department, db: Session) -> SettingsVersion:
    """
    Return the existing SettingsVersion for dept's current target/tolerance,
    or create a new immutable row.  This is the FK anchor for new Samples.
    """
    ver = (
        db.query(SettingsVersion)
        .filter_by(dept_id=dept.dept_id, target=dept.target, tolerance=dept.tolerance)
        .first()
    )
    if ver:
        return ver
    ver = SettingsVersion(
        dept_id=dept.dept_id,
        target=dept.target,
        tolerance=dept.tolerance,
        usl=dept.usl,
        lsl=dept.lsl,
        created_at=datetime.now(timezone.utc),
    )
    db.add(ver)
    db.flush()   # assigns ver.id without committing
    return ver


def _utc_iso(dt: datetime) -> str:
    """
    Always return an ISO-8601 string with an explicit UTC marker ('Z').
    SQLite strips tzinfo on round-trip, so datetime.isoformat() may not include
    a suffix — without it JavaScript's Date() parses the string as *local* time,
    which would show the wrong hour in the browser.
    """
    s = dt.isoformat()
    if not s.endswith("Z") and "+" not in s:
        s += "Z"
    return s


def _ensure_rsb_cans(trial_id: int, db: Session) -> List[LabRSBCan]:
    cans = (
        db.query(LabRSBCan)
        .filter_by(trial_id=trial_id)
        .order_by(LabRSBCan.slot.asc())
        .all()
    )
    slots = {c.slot for c in cans}
    created = False
    for slot in range(1, 11):
        if slot not in slots:
            db.add(LabRSBCan(trial_id=trial_id, slot=slot, is_perfect=False))
            created = True
    if created:
        db.commit()
        cans = (
            db.query(LabRSBCan)
            .filter_by(trial_id=trial_id)
            .order_by(LabRSBCan.slot.asc())
            .all()
        )
    return cans


def _set_reading_fields(
    target,
    readings: List[float],
    sample_length: float,
) -> None:
    weights = [round(r, 6) for r in readings if r is not None and r > 0]
    if weights:
        sample_len = sample_length if sample_length and sample_length > 0 else 6.0
        hank_values = [(sample_len * 0.54) / w for w in weights if w > 0]
        stats = logic.calc_stats(hank_values) if len(hank_values) >= 2 else None
        target.mean_hank = round(sum(hank_values) / len(hank_values), 6) if hank_values else None
        target.cv_pct = round(stats["cv"], 4) if stats else None
        target.readings_json = json.dumps(weights)
        target.readings_count = len(weights)
        if hasattr(target, "hank_value"):
            target.hank_value = target.mean_hank
    else:
        target.readings_json = None
        target.readings_count = 0
        target.mean_hank = None
        target.cv_pct = None
        if hasattr(target, "hank_value"):
            target.hank_value = None


LAB_FLOW_DEPT_IDS = ("rsb", "simplex", "ringframe")


def _lab_dept_map(db: Session) -> Dict[str, Department]:
    """Return the subset of Department rows used by the lab flow UI."""
    rows = (
        db.query(Department)
        .filter(Department.dept_id.in_(LAB_FLOW_DEPT_IDS))
        .all()
    )
    return {row.dept_id: row for row in rows}


def _benchmark_payload(dept: Optional[Department]) -> dict:
    if not dept:
        return {"target": 0.0, "tolerance": 0.0, "cv_limit": 0.0}
    return {
        "target": dept.target,
        "tolerance": dept.tolerance,
        "cv_limit": dept.uster_p50,
    }


def _unit_status(mean: Optional[float], cv: Optional[float], dept: Optional[Department]) -> str:
    if dept is None or mean is None or cv is None:
        return "pending"
    in_hank = (dept.target - dept.tolerance) <= mean <= (dept.target + dept.tolerance)
    in_cv = cv <= dept.uster_p50
    if in_hank and in_cv:
        return "perfect"
    return "faulty"


def _rsb_can_payload(can: LabRSBCan, dept: Optional[Department]) -> dict:
    readings = json.loads(can.readings_json) if can.readings_json else []
    return {
        "id":         can.id,
        "slot":       can.slot,
        "label":      f"Can {can.slot}",
        "hank_value": can.hank_value,
        "notes":      can.notes,
        "is_perfect": can.is_perfect,
        "sample_length": can.sample_length,
        "readings":   readings,
        "readings_count": can.readings_count,
        "mean_hank":  can.mean_hank,
        "cv_pct":     can.cv_pct,
        "status":     _unit_status(can.mean_hank, can.cv_pct, dept),
    }


def _rsb_can_payload_for_link(link: LabSimplexInput, rsb_dept: Optional[Department]) -> dict:
    """
    Build the RSB can payload enriched with per-link readings.
    The `link` object carries independent per-(can, bobbin) measurement data
    so that the same can measured on different bobbins has separate stats.
    """
    can = link.rsb_can
    base = _rsb_can_payload(can, rsb_dept)
    # Overlay with per-link readings when present; fall back to can-level data.
    if link.readings_json:
        link_readings = json.loads(link.readings_json)
        base["link_id"]             = link.id
        base["link_readings"]       = link_readings
        base["link_readings_count"] = link.readings_count
        base["link_mean_hank"]      = link.mean_hank
        base["link_cv_pct"]         = link.cv_pct
        base["link_sample_length"]  = link.sample_length
    else:
        base["link_id"]             = link.id
        base["link_readings"]       = []
        base["link_readings_count"] = 0
        base["link_mean_hank"]      = None
        base["link_cv_pct"]         = None
        base["link_sample_length"]  = link.sample_length or can.sample_length
    return base


def _simplex_bobbin_payload(
    b: LabSimplexBobbin,
    simplex_dept: Optional[Department],
    rsb_dept: Optional[Department],
) -> dict:
    links = sorted(
        [inp for inp in b.inputs if inp.rsb_can is not None],
        key=lambda x: x.rsb_can.slot,
    )
    readings = json.loads(b.readings_json) if b.readings_json else []
    return {
        "id":                 b.id,
        "label":              b.label,
        "hank_value":         b.hank_value,
        "notes":              b.notes,
        "verified_same_hank": b.verified_same_hank,
        "doff_minutes":       b.doff_minutes,
        "sample_length":      b.sample_length,
        "rsb_can_ids":        [inp.rsb_can_id for inp in links],
        "rsb_cans":           [_rsb_can_payload_for_link(inp, rsb_dept) for inp in links],
        "created_at":         b.created_at,
        "readings":           readings,
        "readings_count":     b.readings_count,
        "mean_hank":          b.mean_hank,
        "cv_pct":             b.cv_pct,
        "status":             _unit_status(b.mean_hank, b.cv_pct, simplex_dept),
        "machine_number":     b.machine_number,
        "spindle_number":     b.spindle_number,
    }


def _ringframe_cop_payload(
    c: LabRingframeCop,
    ring_dept: Optional[Department],
    simplex_dept: Optional[Department],
    rsb_dept: Optional[Department],
) -> dict:
    inputs = sorted(
        [inp for inp in c.inputs if inp.simplex_bobbin is not None],
        key=lambda x: (x.simplex_bobbin.order_index, x.simplex_bobbin_id),
    )
    simplex_refs = []
    rsb_refs: list[dict] = []
    seen_rsb: set[int] = set()
    for inp in inputs:
        bob = inp.simplex_bobbin
        simplex_refs.append({
            "id":            bob.id,
            "label":         bob.label,
            "hank_value":    bob.hank_value,
            "machine_number": bob.machine_number,
        })
        sorted_links = sorted(
            [link for link in bob.inputs if link.rsb_can is not None],
            key=lambda x: x.rsb_can.slot,
        )
        for link in sorted_links:
            cid = link.rsb_can.id
            if cid in seen_rsb:
                continue
            seen_rsb.add(cid)
            rsb_refs.append(_rsb_can_payload(link.rsb_can, rsb_dept))

    readings = json.loads(c.readings_json) if c.readings_json else []
    return {
        "id":                 c.id,
        "label":              c.label,
        "frame_number":       c.frame_number,
        "spindle_number":     c.spindle_number,
        "hank_value":         c.hank_value,
        "notes":              c.notes,
        "sample_length":      c.sample_length,
        "simplex_bobbin_ids": [inp.simplex_bobbin_id for inp in inputs],
        "simplex_bobbins":    simplex_refs,
        "rsb_cans":           rsb_refs,
        "created_at":         c.created_at,
        "readings":           readings,
        "readings_count":     c.readings_count,
        "mean_hank":          c.mean_hank,
        "cv_pct":             c.cv_pct,
        "status":             _unit_status(c.mean_hank, c.cv_pct, ring_dept),
    }


def _build_lab_flow(trial_id: int, db: Session) -> LabFlowResponse:
    dept_meta = _lab_dept_map(db)
    rsb_dept = dept_meta.get("rsb")
    simplex_dept = dept_meta.get("simplex")
    ring_dept = dept_meta.get("ringframe")
    cans = [_rsb_can_payload(c, rsb_dept) for c in _ensure_rsb_cans(trial_id, db)]
    bobbins = (
        db.query(LabSimplexBobbin)
        .options(joinedload(LabSimplexBobbin.inputs).joinedload(LabSimplexInput.rsb_can))
        .filter_by(trial_id=trial_id)
        .order_by(LabSimplexBobbin.order_index.asc(), LabSimplexBobbin.id.asc())
        .all()
    )
    cops = (
        db.query(LabRingframeCop)
        .options(
            joinedload(LabRingframeCop.inputs)
            .joinedload(LabRingframeInput.simplex_bobbin)
            .joinedload(LabSimplexBobbin.inputs)
            .joinedload(LabSimplexInput.rsb_can)
        )
        .filter_by(trial_id=trial_id)
        .order_by(LabRingframeCop.id.asc())
        .all()
    )

    return LabFlowResponse(
        rsb={"cans": cans, "benchmark": _benchmark_payload(rsb_dept)},
        simplex={"bobbins": [_simplex_bobbin_payload(b, simplex_dept, rsb_dept) for b in bobbins], "benchmark": _benchmark_payload(simplex_dept)},
        ringframe={"cops": [_ringframe_cop_payload(c, ring_dept, simplex_dept, rsb_dept) for c in cops], "benchmark": _benchmark_payload(ring_dept)},
    )


def _set_simplex_inputs(
    bobbin: LabSimplexBobbin,
    rsb_can_ids: List[int],
    trial_id: int,
    db: Session,
) -> None:
    unique_ids: list[int] = []
    seen: set[int] = set()
    for cid in rsb_can_ids:
        if cid in seen:
            continue
        unique_ids.append(cid)
        seen.add(cid)
    if not unique_ids:
        db.query(LabSimplexInput).filter_by(bobbin_id=bobbin.id).delete()
        return

    rows = (
        db.query(LabRSBCan.id)
        .filter(LabRSBCan.trial_id == trial_id, LabRSBCan.id.in_(unique_ids))
        .all()
    )
    found = {row.id for row in rows}
    missing = [cid for cid in unique_ids if cid not in found]
    if missing:
        raise HTTPException(400, f"RSB can(s) {missing} not found in this trial")

    db.query(LabSimplexInput).filter_by(bobbin_id=bobbin.id).delete()
    for cid in unique_ids:
        db.add(LabSimplexInput(bobbin_id=bobbin.id, rsb_can_id=cid))


def _set_ringframe_inputs(
    cop: LabRingframeCop,
    simplex_bobbin_ids: List[int],
    trial_id: int,
    db: Session,
) -> None:
    unique_ids: list[int] = []
    seen: set[int] = set()
    for bid in simplex_bobbin_ids:
        if bid in seen:
            continue
        unique_ids.append(bid)
        seen.add(bid)
    if not unique_ids:
        db.query(LabRingframeInput).filter_by(cop_id=cop.id).delete()
        return

    rows = (
        db.query(LabSimplexBobbin.id)
        .filter(LabSimplexBobbin.trial_id == trial_id, LabSimplexBobbin.id.in_(unique_ids))
        .all()
    )
    found = {row.id for row in rows}
    missing = [bid for bid in unique_ids if bid not in found]
    if missing:
        raise HTTPException(400, f"Simplex bobbin(s) {missing} not found in this trial")

    db.query(LabRingframeInput).filter_by(cop_id=cop.id).delete()
    for bid in unique_ids:
        db.add(LabRingframeInput(cop_id=cop.id, simplex_bobbin_id=bid))


def _batch_means(
    dept_id: str,
    shift: Optional[str],
    db: Session,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> List[float]:
    """
    Return the mean_hank column only (no JSON parsing) for the given dept/shift.
    Ordered by timestamp ascending for correct time-series analysis.
    This is the performance-critical path for the overview and WE rules.
    """
    q = (
        db.query(Sample.mean_hank)
        .filter(Sample.dept_id == dept_id)
        .order_by(Sample.timestamp.asc())
    )
    if shift and shift != "ALL":
        q = q.filter(Sample.shift == shift)
    if date_from is not None:
        q = q.filter(Sample.timestamp >= date_from)
    if date_to is not None:
        q = q.filter(Sample.timestamp <= date_to)
    return [row.mean_hank for row in q.all()]


def _subgroup_size(dept_id: str, db: Session) -> int:
    """
    Number of readings in the most recent batch — used as n for control limits.
    Uses the stored readings_count column (no JSON parsing required).
    """
    last = (
        db.query(Sample.readings_count)
        .filter(Sample.dept_id == dept_id)
        .order_by(Sample.timestamp.desc())
        .first()
    )
    return last.readings_count if last else 5


def _enrich_sample(s: Sample) -> SampleOut:
    """Build SampleOut from ORM row.  Reads readings_json for full detail."""
    readings = json.loads(s.readings_json)
    stats = logic.calc_stats(readings)
    sv = s.settings_version   # already loaded via joinedload
    cpk = logic.calc_cpk(stats["mean"], stats["sd"], sv.usl, sv.lsl) if stats else None
    cp  = logic.calc_cp(stats["sd"],  sv.usl, sv.lsl)                if stats else None
    dept_dict = s.department.to_dict()
    q = logic.quality_status(stats["cv"], cpk, dept_dict)           if stats else None
    return SampleOut(
        id=s.id,
        dept_id=s.dept_id,
        shift=s.shift,
        timestamp=s.timestamp,
        readings=readings,
        avg_weight=s.avg_weight,
        mean_hank=s.mean_hank,
        sample_length=s.sample_length,
        unit=s.unit,
        target_value=sv.target,
        usl_value=sv.usl,
        lsl_value=sv.lsl,
        cv=round(stats["cv"], 4) if stats else None,
        cpk=round(cpk, 4)        if cpk is not None else None,
        cp=round(cp, 4)          if cp  is not None else None,
        quality=q,
        frame_number=s.frame_number,
        simplex_lane=s.simplex_lane,
        measurement_type=s.measurement_type,
    )


# ── Settings ──────────────────────────────────────────────────────────────────
@app.get("/api/settings", response_model=List[SettingsOut])
def get_all_settings(db: Session = Depends(get_db)):
    return [
        SettingsOut(
            dept_id=d.dept_id, target=d.target, tolerance=d.tolerance,
            def_len=d.def_len, usl=d.usl, lsl=d.lsl,
        )
        for d in _ordered_depts(db)
    ]


@app.put("/api/settings/{dept_id}", response_model=SettingsOut)
def update_settings(dept_id: str, body: SettingsUpdate, db: Session = Depends(get_db)):
    d = _get_dept_or_404(dept_id, db)
    d.target    = body.target
    d.tolerance = body.tolerance
    d.def_len   = body.def_len
    # Create a new immutable SettingsVersion for this new target pair
    _get_or_create_version(d, db)
    db.commit()
    return SettingsOut(
        dept_id=d.dept_id, target=d.target, tolerance=d.tolerance,
        def_len=d.def_len, usl=d.usl, lsl=d.lsl,
    )


@app.post("/api/settings/reset", response_model=List[SettingsOut])
def reset_settings(db: Session = Depends(get_db)):
    """Reset all department targets to factory defaults."""
    defaults = {
        "carding":   (0.120, 0.010, 6.0),
        "breaker":   (0.120, 0.010, 6.0),
        "rsb":       (0.120, 0.010, 6.0),
        "simplex":   (1.120, 0.100, 6.0),
        "ringframe": (47.5,  0.5,   120.0),
        "autoconer": (47.0,  0.5,   120.0),
    }
    for d in db.query(Department).all():
        if d.dept_id in defaults:
            t, tol, dl = defaults[d.dept_id]
            d.target    = t
            d.tolerance = tol
            d.def_len   = dl
            _get_or_create_version(d, db)
    db.commit()
    return get_all_settings(db)


# ── Department definitions ────────────────────────────────────────────────────
@app.get("/api/depts")
def get_depts(db: Session = Depends(get_db)):
    """
    Department definitions sourced entirely from the departments table.
    No hardcoded DEPTS constant — single source of truth is the database.
    """
    return [
        {
            **d.to_dict(),
            "usl": d.usl,
            "lsl": d.lsl,
        }
        for d in _ordered_depts(db)
    ]


# ── Samples ───────────────────────────────────────────────────────────────────
@app.post("/api/samples", response_model=SampleOut, status_code=201)
def create_sample(body: SampleCreate, db: Session = Depends(get_db)):
    dept = _get_dept_or_404(body.dept_id, db)
    ver  = _get_or_create_version(dept, db)

    readings  = [round(r, 6) for r in body.readings]
    mean_hank = sum(readings) / len(readings)
    cv_pct    = logic.calc_stats(readings)
    cv_pct    = round(cv_pct["cv"], 4) if cv_pct else None

    # Use caller-supplied historical timestamp if provided; else current UTC.
    # Normalise to UTC-aware datetime regardless of what the client sends.
    if body.recorded_at is not None:
        ts = body.recorded_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)   # treat naive as UTC
        else:
            ts = ts.astimezone(timezone.utc)
    else:
        ts = datetime.now(timezone.utc)

    sample = Sample(
        dept_id=dept.dept_id,
        settings_version_id=ver.id,
        shift=body.shift,
        timestamp=ts,
        readings_json=json.dumps(readings),
        avg_weight=body.avg_weight,
        mean_hank=round(mean_hank, 6),
        sample_length=body.sample_length,
        unit=dept.unit,
        readings_count=len(readings),
        cv_pct=cv_pct,
        frame_number=body.frame_number,
        simplex_lane=body.simplex_lane,
        measurement_type=body.measurement_type,
    )
    db.add(sample)
    db.commit()
    db.refresh(sample)

    # Eager-load relationships for _enrich_sample
    s = (
        db.query(Sample)
        .options(joinedload(Sample.settings_version), joinedload(Sample.department))
        .filter_by(id=sample.id)
        .one()
    )
    return _enrich_sample(s)


@app.get("/api/samples", response_model=List[SampleOut])
def list_samples(
    dept_id:      Optional[str] = None,
    shift:        Optional[str] = None,
    frame_number: Optional[int] = None,
    date_from:    Optional[datetime] = None,   # ISO-8601, inclusive
    date_to:      Optional[datetime] = None,   # ISO-8601, inclusive (end of day)
    db: Session = Depends(get_db),
):
    q = (
        db.query(Sample)
        .options(joinedload(Sample.settings_version), joinedload(Sample.department))
        .order_by(Sample.timestamp.desc())
    )
    if dept_id and dept_id != "ALL":
        q = q.filter(Sample.dept_id == dept_id)
    if shift and shift != "ALL":
        q = q.filter(Sample.shift == shift)
    if frame_number is not None:
        q = q.filter(Sample.frame_number == frame_number)
    if date_from is not None:
        q = q.filter(Sample.timestamp >= date_from)
    if date_to is not None:
        q = q.filter(Sample.timestamp <= date_to)
    return [_enrich_sample(s) for s in q.all()]


@app.get("/api/samples/{sample_id}", response_model=SampleOut)
def get_sample(sample_id: int, db: Session = Depends(get_db)):
    s = (
        db.query(Sample)
        .options(joinedload(Sample.settings_version), joinedload(Sample.department))
        .filter_by(id=sample_id)
        .first()
    )
    if not s:
        raise HTTPException(404, "Sample not found")
    return _enrich_sample(s)


@app.put("/api/samples/{sample_id}", response_model=SampleOut)
def update_sample(sample_id: int, body: SampleUpdate, db: Session = Depends(get_db)):
    s = (
        db.query(Sample)
        .options(joinedload(Sample.settings_version), joinedload(Sample.department))
        .filter_by(id=sample_id)
        .first()
    )
    if not s:
        raise HTTPException(404, "Sample not found")

    readings  = [round(r, 6) for r in body.readings]
    mean_hank = sum(readings) / len(readings)
    cv_stats  = logic.calc_stats(readings)
    cv_pct    = round(cv_stats["cv"], 4) if cv_stats else None

    s.readings_json    = json.dumps(readings)
    s.mean_hank        = round(mean_hank, 6)
    s.readings_count   = len(readings)
    s.cv_pct           = cv_pct
    if body.avg_weight is not None:
        s.avg_weight   = body.avg_weight

    db.commit()
    db.refresh(s)

    # Re-load with relationships for _enrich_sample
    s = (
        db.query(Sample)
        .options(joinedload(Sample.settings_version), joinedload(Sample.department))
        .filter_by(id=sample_id)
        .one()
    )
    return _enrich_sample(s)


@app.delete("/api/samples/{sample_id}", status_code=204)
def delete_sample(sample_id: int, db: Session = Depends(get_db)):
    s = db.query(Sample).filter_by(id=sample_id).first()
    if not s:
        raise HTTPException(404, "Sample not found")
    db.delete(s)
    db.commit()


@app.delete("/api/samples", status_code=204)
def clear_all_samples(db: Session = Depends(get_db)):
    db.query(Sample).delete()
    db.commit()


# ── Overview / KPIs ───────────────────────────────────────────────────────────
@app.get("/api/overview", response_model=List[DeptKPI])
def get_overview(
    shift: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    db: Session = Depends(get_db),
):
    """
    Performance-optimised overview.

    For each department we execute ONE lightweight column query that fetches
    only the mean_hank float column (no readings_json deserialisation).
    WE rules and control limits are evaluated on these batch means, which is
    also the statistically correct approach for an X-bar control chart.

    The subgroup size (n for √n in limit formula) is fetched from the stored
    readings_count column — again, no JSON parsing.
    """
    result: List[DeptKPI] = []

    for dept in _ordered_depts(db):
        batch_means = _batch_means(dept.dept_id, shift, db, date_from, date_to)
        stats       = logic.calc_stats(batch_means)
        sg_size     = _subgroup_size(dept.dept_id, db)
        dept_dict   = dept.to_dict()

        cpk = ucl = lcl = wul = wll = cp = None
        q   = None
        violations: List[dict]  = []
        suggestions: List[str]  = []

        if stats:
            cpk  = logic.calc_cpk(stats["mean"], stats["sd"], dept.usl, dept.lsl)
            cp   = logic.calc_cp( stats["sd"],                dept.usl, dept.lsl)
            lims = logic.calc_control_limits(stats["mean"], stats["sd"], subgroup_size=1)
            ucl, lcl, wul, wll = lims["ucl"], lims["lcl"], lims["wul"], lims["wll"]
            q    = logic.quality_status(stats["cv"], cpk, dept_dict)

            # WE rules on batch-mean history — stateful, full history, no JSON needed
            violations  = logic.detect_we_violations(
                batch_means, stats["mean"], stats["sd"], subgroup_size=1
            )
            suggestions = logic.get_machine_suggestions(
                dept_dict, batch_means, stats["mean"], stats["sd"],
                stats["cv"], cpk, dept.usl, dept.lsl, subgroup_size=1,
            )

        result.append(DeptKPI(
            dept_id=dept.dept_id,
            name=dept.name,
            short=dept.short,
            unit=dept.unit,
            frequency=dept.frequency,
            target=dept.target,
            tolerance=dept.tolerance,
            usl=dept.usl,
            lsl=dept.lsl,
            uster=dept.uster,
            n=stats["n"]    if stats else 0,
            mean=round(stats["mean"], 6) if stats else None,
            sd=round(stats["sd"],   6)   if stats else None,
            cv=round(stats["cv"],   4)   if stats else None,
            cpk=round(cpk, 4) if cpk is not None else None,
            cp=round(cp,  4)  if cp  is not None else None,
            ucl=round(ucl, 6) if ucl is not None else None,
            lcl=round(lcl, 6) if lcl is not None else None,
            wul=round(wul, 6) if wul is not None else None,
            wll=round(wll, 6) if wll is not None else None,
            quality=q,
            subgroup_size=sg_size,
            violations=violations,
            suggestions=suggestions,
        ))

    return result


# ── Alerts ────────────────────────────────────────────────────────────────────
@app.get("/api/alerts", response_model=List[Alert])
def get_alerts(db: Session = Depends(get_db)):
    alerts: List[Alert] = []

    for dept in _ordered_depts(db):
        batch_means = _batch_means(dept.dept_id, None, db)
        stats = logic.calc_stats(batch_means)
        if not stats:
            continue

        dept_dict = dept.to_dict()
        cpk = logic.calc_cpk(stats["mean"], stats["sd"], dept.usl, dept.lsl)
        violations = logic.detect_we_violations(
            batch_means, stats["mean"], stats["sd"], subgroup_size=1
        )

        for v in violations:
            alerts.append(Alert(
                dept_id=dept.dept_id,
                dept_name=dept.name,
                severity=v["severity"],
                message=f"{dept.name}: {v['msg']}",
            ))

        if cpk is not None and cpk < 1.0:
            alerts.append(Alert(
                dept_id=dept.dept_id, dept_name=dept.name, severity="bad",
                message=f"{dept.name}: Cpk = {cpk:.2f} — process not capable (need ≥ 1.33)",
            ))
        elif cpk is not None and cpk < 1.33:
            alerts.append(Alert(
                dept_id=dept.dept_id, dept_name=dept.name, severity="warn",
                message=f"{dept.name}: Cpk = {cpk:.2f} — marginal capability",
            ))

        if stats["cv"] > dept.uster_p75:
            alerts.append(Alert(
                dept_id=dept.dept_id, dept_name=dept.name, severity="warn",
                message=f"{dept.name}: CV% {stats['cv']:.2f}% exceeds Uster 75th percentile",
            ))
        elif stats["cv"] <= dept.uster_p25:
            alerts.append(Alert(
                dept_id=dept.dept_id, dept_name=dept.name, severity="ok",
                message=f"{dept.name}: CV% {stats['cv']:.2f}% — top quartile quality ✓",
            ))

    return alerts


# ── Data log ──────────────────────────────────────────────────────────────────
@app.get("/api/log")
def get_log(
    dept_id:      Optional[str] = None,
    shift:        Optional[str] = None,
    frame_number: Optional[int] = None,
    date_from:    Optional[datetime] = None,   # ISO-8601, inclusive
    date_to:      Optional[datetime] = None,   # ISO-8601, inclusive (end of day)
    sort_col:     str = "timestamp",
    sort_dir:     str = "desc",
    db: Session = Depends(get_db),
):
    """
    Data log with stored cv_pct / readings_count — no readings_json parsing
    required for any column rendered in the table.  The join to settings_versions
    retrieves snapshot target/usl/lsl without touching the samples row's JSON.
    """
    col_map = {
        "timestamp":  Sample.timestamp,
        "mean_hank":  Sample.mean_hank,
        "avg_weight": Sample.avg_weight,
        "cv":         Sample.cv_pct,
    }
    order_col = col_map.get(sort_col, Sample.timestamp)
    order_expr = order_col.asc() if sort_dir == "asc" else order_col.desc()

    q = (
        db.query(Sample)
        .options(joinedload(Sample.settings_version), joinedload(Sample.department))
        .order_by(order_expr)
    )
    if dept_id and dept_id != "ALL":
        q = q.filter(Sample.dept_id == dept_id)
    if shift and shift != "ALL":
        q = q.filter(Sample.shift == shift)
    if frame_number is not None:
        q = q.filter(Sample.frame_number == frame_number)
    if date_from is not None:
        q = q.filter(Sample.timestamp >= date_from)
    if date_to is not None:
        q = q.filter(Sample.timestamp <= date_to)

    samples = q.all()
    rows = []
    for s in samples:
        sv   = s.settings_version
        dept = s.department
        cpk  = None
        if s.cv_pct is not None and s.mean_hank and sv:
            stats = {"mean": s.mean_hank, "sd": None, "cv": s.cv_pct}
            # Recompute sd from cv_pct for cpk (cv = sd/mean*100 → sd = cv*mean/100)
            sd  = (s.cv_pct / 100.0) * s.mean_hank
            cpk = logic.calc_cpk(s.mean_hank, sd, sv.usl, sv.lsl)

        dept_dict = dept.to_dict() if dept else {}
        q_status  = logic.quality_status(s.cv_pct or 0, cpk, dept_dict) if dept_dict else None

        rows.append({
            "id":              s.id,
            "dept_id":         s.dept_id,
            "dept_name":       dept.name if dept else s.dept_id,
            "shift":           s.shift,
            "timestamp":       _utc_iso(s.timestamp),
            "avg_weight":      s.avg_weight,
            "mean_hank":       s.mean_hank,
            "unit":            s.unit,
            "readings_count":  s.readings_count,
            "cv":              round(s.cv_pct, 4) if s.cv_pct is not None else None,
            "cpk":             round(cpk, 4)     if cpk is not None else None,
            "quality":         q_status,
            # Snapshot targets — from settings_version row (not duplicated floats)
            "target_value":    sv.target if sv else None,
            "usl_value":       sv.usl    if sv else None,
            "lsl_value":       sv.lsl    if sv else None,
            "frame_number":    s.frame_number,
            "simplex_lane":    s.simplex_lane,
            "measurement_type": s.measurement_type,
        })

    return {"total": len(rows), "rows": rows}


# ── Uster benchmarks ──────────────────────────────────────────────────────────
@app.get("/api/uster")
def get_uster(
    shift:     Optional[str]      = None,
    date_from: Optional[datetime] = None,
    date_to:   Optional[datetime] = None,
    db: Session = Depends(get_db),
):
    """Uster table driven from departments.uster_p* columns."""
    rows = []
    for dept in _ordered_depts(db):
        batch_means = _batch_means(dept.dept_id, shift if shift and shift != "ALL" else None, db, date_from, date_to)
        stats = logic.calc_stats(batch_means)
        cv    = stats["cv"] if stats else None
        us    = dept.uster

        if cv is None:
            rank = None
        elif cv <= us["p5"]:
            rank = "Top 5%"
        elif cv <= us["p25"]:
            rank = "Top 25%"
        elif cv <= us["p50"]:
            rank = "Median"
        elif cv <= us["p75"]:
            rank = "75th"
        else:
            rank = ">95th"

        q = None
        if cv is not None:
            q = "ok" if cv <= us["p25"] else ("warn" if cv <= us["p50"] else "bad")

        rows.append({
            "dept_id": dept.dept_id,
            "name":    dept.name,
            "uster":   us,
            "cv":      round(cv, 4) if cv is not None else None,
            "rank":    rank,
            "quality": q,
        })
    return rows


# ── Utility calculations ──────────────────────────────────────────────────────
@app.post("/api/calc/irregularity", response_model=IIResponse)
def calc_irregularity(body: IIRequest):
    return logic.calc_irregularity_index(body.cv_actual, body.ne, body.fibre_length_mm)


@app.post("/api/calc/predict-rf")
def predict_rf(body: PredictRequest, db: Session = Depends(get_db)):
    cv_d = body.cv_drawing
    cv_s = body.cv_simplex
    if cv_d is None:
        st = logic.calc_stats(_batch_means("breaker", None, db))
        cv_d = st["cv"] if st else 1.5
    if cv_s is None:
        st = logic.calc_stats(_batch_means("simplex", None, db))
        cv_s = st["cv"] if st else 2.5

    pred = logic.predict_ring_frame_cv(body.cv_carding, cv_d, cv_s)
    rf   = db.query(Department).filter_by(dept_id="ringframe").first()
    p25  = rf.uster_p25 if rf else 2.0
    p50  = rf.uster_p50 if rf else 2.8
    q    = "ok" if pred <= p25 else ("warn" if pred <= p50 else "bad")

    return {
        "predicted_cv": round(pred, 4),
        "cv_drawing":   round(cv_d, 4),
        "cv_simplex":   round(cv_s, 4),
        "quality":      q,
        "target_p25":   p25,
    }


# ── CSV export ────────────────────────────────────────────────────────────────
@app.get("/api/export/csv")
def export_csv(db: Session = Depends(get_db)):
    samples = (
        db.query(Sample)
        .options(joinedload(Sample.settings_version), joinedload(Sample.department))
        .order_by(Sample.timestamp.asc())
        .all()
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Timestamp", "Department", "Shift",
        "Avg Weight (g)", "Mean Hank", "Unit", "Sample Length (yds)",
        "Target (snapshot)", "USL (snapshot)", "LSL (snapshot)",
        "Reading #", "Hank Value",
    ])
    for s in samples:
        sv      = s.settings_version
        dept    = s.department
        readings = json.loads(s.readings_json)
        for i, v in enumerate(readings, 1):
            writer.writerow([
                s.timestamp.isoformat(),
                dept.name if dept else s.dept_id,
                s.shift,
                f"{s.avg_weight:.4f}" if s.avg_weight else "",
                f"{s.mean_hank:.6f}",
                s.unit,
                s.sample_length,
                sv.target if sv else "",
                sv.usl    if sv else "",
                sv.lsl    if sv else "",
                i,
                f"{v:.6f}",
            ])
    output.seek(0)
    date_str = datetime.now().strftime("%Y-%m-%d")
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=spinqms_{date_str}.csv"},
    )


# ── YarnLAB ───────────────────────────────────────────────────────────────────

def _lab_verdict(cpk: Optional[float], n: int) -> str:
    """Translate cpk + sample count to a YarnLAB verdict string."""
    if n == 0:
        return "pending"
    if cpk is None:
        return "pending"
    if cpk >= 1.33:
        return "pass"
    if cpk >= 1.0:
        return "warn"
    return "fail"


@app.get("/api/lab/trials")
def list_lab_trials(db: Session = Depends(get_db)):
    """List all lab trials with summary counts."""
    trials = db.query(LabTrial).order_by(LabTrial.created_at.desc()).all()
    result = []
    for t in trials:
        bench_count  = len(t.benchmarks)
        sample_count = len(t.samples)
        dept_ids     = {s.dept_id for s in t.samples}
        result.append({
            "id":           t.id,
            "name":         t.name,
            "description":  t.description,
            "status":       t.status,
            "created_at":   _utc_iso(t.created_at),
            "bench_count":  bench_count,
            "sample_count": sample_count,
            "dept_count":   len(dept_ids),
        })
    return result


@app.post("/api/lab/trials", status_code=201)
def create_lab_trial(body: LabTrialCreate, db: Session = Depends(get_db)):
    trial = LabTrial(
        name=body.name,
        description=body.description,
        status="active",
        created_at=datetime.now(timezone.utc),
    )
    db.add(trial)
    db.flush()

    # Pre-populate benchmarks from current production department settings
    for dept in _ordered_depts(db):
        bench = LabBenchmark(
            trial_id=trial.id,
            dept_id=dept.dept_id,
            target=dept.target,
            tolerance=dept.tolerance,
        )
        db.add(bench)

    for slot in range(1, 11):
        db.add(LabRSBCan(trial_id=trial.id, slot=slot, is_perfect=False, sample_length=6.0))

    db.commit()
    db.refresh(trial)
    return {
        "id":          trial.id,
        "name":        trial.name,
        "description": trial.description,
        "status":      trial.status,
        "created_at":  _utc_iso(trial.created_at),
    }


@app.put("/api/lab/trials/{trial_id}")
def update_lab_trial(trial_id: int, body: LabTrialUpdate, db: Session = Depends(get_db)):
    t = db.query(LabTrial).filter_by(id=trial_id).first()
    if not t:
        raise HTTPException(404, "Trial not found")
    if body.name is not None:
        t.name = body.name
    if body.description is not None:
        t.description = body.description
    if body.status is not None:
        t.status = body.status
    db.commit()
    return {"id": t.id, "name": t.name, "description": t.description, "status": t.status}


@app.delete("/api/lab/trials/{trial_id}", status_code=204)
def delete_lab_trial(trial_id: int, db: Session = Depends(get_db)):
    t = db.query(LabTrial).filter_by(id=trial_id).first()
    if not t:
        raise HTTPException(404, "Trial not found")
    db.delete(t)
    db.commit()


@app.post("/api/lab/trials/{trial_id}/benchmarks")
def set_lab_benchmarks(
    trial_id: int,
    body: List[LabBenchmarkItem],
    db: Session = Depends(get_db),
):
    """Upsert benchmark targets for a trial (one item per dept)."""
    t = db.query(LabTrial).filter_by(id=trial_id).first()
    if not t:
        raise HTTPException(404, "Trial not found")

    existing = {b.dept_id: b for b in t.benchmarks}
    for item in body:
        if item.dept_id in existing:
            existing[item.dept_id].target    = item.target
            existing[item.dept_id].tolerance = item.tolerance
        else:
            db.add(LabBenchmark(
                trial_id=trial_id,
                dept_id=item.dept_id,
                target=item.target,
                tolerance=item.tolerance,
            ))
    db.commit()
    return {"saved": len(body)}


@app.post("/api/lab/trials/{trial_id}/samples", status_code=201)
def add_lab_sample(
    trial_id: int,
    body: LabSampleCreate,
    db: Session = Depends(get_db),
):
    t = db.query(LabTrial).filter_by(id=trial_id).first()
    if not t:
        raise HTTPException(404, "Trial not found")

    readings  = [round(r, 6) for r in body.readings]
    mean_hank = sum(readings) / len(readings)
    cv_stats  = logic.calc_stats(readings)
    cv_pct    = round(cv_stats["cv"], 4) if cv_stats else None

    # Determine sample_length: use benchmark dept's def_len as fallback
    dept = db.query(Department).filter_by(dept_id=body.dept_id).first()
    sample_length = body.sample_length if body.sample_length else (dept.def_len if dept else 6.0)

    sample = LabSample(
        trial_id=trial_id,
        dept_id=body.dept_id,
        readings_json=json.dumps(readings),
        mean_hank=round(mean_hank, 6),
        cv_pct=cv_pct,
        readings_count=len(readings),
        avg_weight=body.avg_weight,
        sample_length=sample_length,
        frame_number=body.frame_number,
        notes=body.notes,
        timestamp=datetime.now(timezone.utc),
    )
    db.add(sample)
    db.commit()
    db.refresh(sample)
    return {
        "id":           sample.id,
        "dept_id":      sample.dept_id,
        "mean_hank":    sample.mean_hank,
        "cv_pct":       sample.cv_pct,
        "readings_count": sample.readings_count,
        "timestamp":    _utc_iso(sample.timestamp),
    }


@app.delete("/api/lab/trials/{trial_id}/samples/{sample_id}", status_code=204)
def delete_lab_sample(trial_id: int, sample_id: int, db: Session = Depends(get_db)):
    s = db.query(LabSample).filter_by(id=sample_id, trial_id=trial_id).first()
    if not s:
        raise HTTPException(404, "Sample not found")
    db.delete(s)
    db.commit()


@app.get("/api/lab/trials/{trial_id}/dashboard")
def get_lab_dashboard(trial_id: int, db: Session = Depends(get_db)):
    """
    Validation dashboard for a trial.

    For each department that has a benchmark, compute:
    • mean, sd, cv, cpk, cp  against the gold-standard limits
    • verdict: 'pass' | 'warn' | 'fail' | 'pending'
    • list of individual sample means (for sparkline rendering)
    """
    t = db.query(LabTrial).filter_by(id=trial_id).first()
    if not t:
        raise HTTPException(404, "Trial not found")

    # Index benchmarks and samples by dept
    bench_by_dept  = {b.dept_id: b for b in t.benchmarks}
    samples_by_dept: dict[str, list] = {}
    for s in t.samples:
        samples_by_dept.setdefault(s.dept_id, []).append(s)

    # Canonical dept order — only include depts that have a benchmark
    order    = ["rsb", "simplex", "ringframe"]
    dept_rows = []

    for dept_id in order:
        bench = bench_by_dept.get(dept_id)
        if bench is None:
            continue

        usl = round(bench.target + bench.tolerance, 6)
        lsl = round(bench.target - bench.tolerance, 6)

        samps      = samples_by_dept.get(dept_id, [])
        means      = [s.mean_hank for s in samps]
        stats      = logic.calc_stats(means) if len(means) >= 2 else None

        cpk = cp = None
        if stats and stats["sd"] > 0:
            cpk = logic.calc_cpk(stats["mean"], stats["sd"], usl, lsl)
            cp  = logic.calc_cp( stats["sd"],                usl, lsl)

        single_mean = means[0] if len(means) == 1 else None
        display_mean = round(stats["mean"], 6) if stats else (round(single_mean, 6) if single_mean else None)

        verdict = _lab_verdict(cpk, len(means))

        # Get dept name from departments table
        dept_obj = db.query(Department).filter_by(dept_id=dept_id).first()
        dept_name = dept_obj.name if dept_obj else dept_id.title()
        unit      = dept_obj.unit if dept_obj else "hank"

        dept_rows.append({
            "dept_id":   dept_id,
            "dept_name": dept_name,
            "unit":      unit,
            "benchmark": {
                "target":    bench.target,
                "tolerance": bench.tolerance,
                "usl":       usl,
                "lsl":       lsl,
            },
            "result": {
                "n":    len(means),
                "mean": display_mean,
                "sd":   round(stats["sd"],  6) if stats else None,
                "cv":   round(stats["cv"],  4) if stats else None,
                "cpk":  round(cpk, 4)          if cpk is not None else None,
                "cp":   round(cp,  4)           if cp  is not None else None,
            },
            "verdict": verdict,
            "samples": [
                {
                    "id":        s.id,
                    "mean_hank": s.mean_hank,
                    "cv_pct":    s.cv_pct,
                    "timestamp": _utc_iso(s.timestamp),
                    "notes":     s.notes,
                }
                for s in sorted(samps, key=lambda x: x.timestamp)
            ],
        })

    # Overall trial verdict
    verdicts   = [r["verdict"] for r in dept_rows]
    n_pending  = verdicts.count("pending")
    n_fail     = verdicts.count("fail")
    n_warn     = verdicts.count("warn")
    n_pass     = verdicts.count("pass")
    if n_fail > 0:
        overall = "fail"
    elif n_pending == len(dept_rows):
        overall = "pending"
    elif n_warn > 0 or n_pending > 0:
        overall = "warn"
    else:
        overall = "pass"

    return {
        "trial": {
            "id":          t.id,
            "name":        t.name,
            "description": t.description,
            "status":      t.status,
            "created_at":  _utc_iso(t.created_at),
        },
        "overall":     overall,
        "counts":      {"pass": n_pass, "warn": n_warn, "fail": n_fail, "pending": n_pending},
        "departments": dept_rows,
    }


@app.get("/api/lab/trials/{trial_id}/flow", response_model=LabFlowResponse)
def get_lab_flow(trial_id: int, db: Session = Depends(get_db)):
    _get_trial_or_404(trial_id, db)
    return _build_lab_flow(trial_id, db)


@app.put("/api/lab/trials/{trial_id}/flow/rsb", response_model=RSBSection)
def save_rsb_cans(trial_id: int, body: RSBCanBulkSave, db: Session = Depends(get_db)):
    _get_trial_or_404(trial_id, db)
    dept_meta = _lab_dept_map(db)
    rsb_dept = dept_meta.get("rsb")
    cans = _ensure_rsb_cans(trial_id, db)
    slot_map = {c.slot: c for c in cans}
    for item in body.cans:
        row = slot_map[item.slot]
        row.notes = item.notes
        row.is_perfect = item.is_perfect
        row.sample_length = item.sample_length
        weights = [round(r, 6) for r in (item.readings or []) if r is not None]
        _set_reading_fields(row, weights, row.sample_length)
        # If no readings were taken but a manual hank_value was provided, honour it.
        # _set_reading_fields sets hank_value=None when weights is empty, so apply after.
        if not weights and item.hank_value is not None:
            row.hank_value = item.hank_value
    db.commit()
    refreshed = _ensure_rsb_cans(trial_id, db)
    return {
        "cans": [_rsb_can_payload(c, rsb_dept) for c in refreshed],
        "benchmark": _benchmark_payload(rsb_dept),
    }


@app.post("/api/lab/trials/{trial_id}/flow/simplex", status_code=201, response_model=SimplexBobbinOut)
def create_simplex_bobbin(
    trial_id: int,
    body: SimplexBobbinCreate,
    db: Session = Depends(get_db),
):
    _get_trial_or_404(trial_id, db)
    dept_meta = _lab_dept_map(db)
    count = (
        db.query(func.count(LabSimplexBobbin.id))
        .filter(LabSimplexBobbin.trial_id == trial_id)
        .scalar()
    )
    # ── Structured ID: {can_slot}-{n}  e.g. "1-1", "1-2", "3-1" ──────────────
    # If body.label is explicitly supplied (non-empty), honour it as-is.
    provided = (body.label or "").strip()
    if provided:
        label = provided
    elif body.rsb_can_ids:
        first_can = (
            db.query(LabRSBCan)
            .filter(LabRSBCan.trial_id == trial_id, LabRSBCan.id == body.rsb_can_ids[0])
            .first()
        )
        if first_can:
            # Count bobbins already linked to this specific can on the same
            # machine (machine_number-scoped so each machine restarts from 1).
            siblings_q = (
                db.query(func.count(LabSimplexInput.id))
                .join(LabSimplexBobbin, LabSimplexInput.bobbin_id == LabSimplexBobbin.id)
                .filter(
                    LabSimplexInput.rsb_can_id == first_can.id,
                    LabSimplexBobbin.trial_id == trial_id,
                )
            )
            if body.machine_number is not None:
                siblings_q = siblings_q.filter(
                    LabSimplexBobbin.machine_number == body.machine_number
                )
            siblings = siblings_q.scalar() or 0
            label = f"{first_can.slot}-{siblings + 1}"
        else:
            label = f"B{count + 1}"
    else:
        label = f"B{count + 1}"

    # Guarantee uniqueness within the same machine context (handles gaps from
    # deletions).  Scoped to machine_number so identical labels on different
    # machines are intentional and allowed.
    existing_labels_q = (
        db.query(LabSimplexBobbin.label)
        .filter(LabSimplexBobbin.trial_id == trial_id)
    )
    if body.machine_number is not None:
        existing_labels_q = existing_labels_q.filter(
            LabSimplexBobbin.machine_number == body.machine_number
        )
    existing_labels = {row[0] for row in existing_labels_q.all()}
    base_label = label
    suffix = 2
    while label in existing_labels:
        label = f"{base_label}-{suffix}"
        suffix += 1

    bobbin = LabSimplexBobbin(
        trial_id=trial_id,
        label=label,
        hank_value=body.hank_value,
        notes=body.notes,
        verified_same_hank=body.verified_same_hank,
        doff_minutes=body.doff_minutes,
        order_index=count or 0,
        sample_length=body.sample_length,
        machine_number=body.machine_number,
        spindle_number=body.spindle_number,
    )
    db.add(bobbin)
    db.flush()
    if body.rsb_can_ids:
        _set_simplex_inputs(bobbin, body.rsb_can_ids, trial_id, db)
    readings = [round(r, 6) for r in (body.readings or []) if r is not None]
    _set_reading_fields(bobbin, readings, bobbin.sample_length)
    db.commit()
    db.refresh(bobbin)
    return _simplex_bobbin_payload(bobbin, dept_meta.get("simplex"), dept_meta.get("rsb"))


@app.put("/api/lab/simplex/{bobbin_id}", response_model=SimplexBobbinOut)
def update_simplex_bobbin(
    bobbin_id: int,
    body: SimplexBobbinUpdate,
    db: Session = Depends(get_db),
):
    dept_meta = _lab_dept_map(db)
    bobbin = (
        db.query(LabSimplexBobbin)
        .options(joinedload(LabSimplexBobbin.inputs).joinedload(LabSimplexInput.rsb_can))
        .filter_by(id=bobbin_id)
        .first()
    )
    if not bobbin:
        raise HTTPException(404, "Simplex bobbin not found")

    if body.hank_value is not None:
        bobbin.hank_value = body.hank_value
    if body.notes is not None:
        bobbin.notes = body.notes
    if body.verified_same_hank is not None:
        bobbin.verified_same_hank = body.verified_same_hank
    if body.doff_minutes is not None:
        bobbin.doff_minutes = body.doff_minutes
    if body.sample_length is not None:
        bobbin.sample_length = body.sample_length
    if body.rsb_can_ids is not None:
        _set_simplex_inputs(bobbin, body.rsb_can_ids, bobbin.trial_id, db)
        # Do NOT auto-rename on linkage changes — the structured ID was assigned
        # at creation time and should remain stable regardless of re-linking.
    if body.label is not None:
        stripped = body.label.strip()
        if stripped:
            bobbin.label = stripped
    if body.readings is not None:
        readings = [round(r, 6) for r in body.readings if r is not None]
        _set_reading_fields(bobbin, readings, bobbin.sample_length)
    if body.machine_number is not None:
        bobbin.machine_number = body.machine_number
    if body.spindle_number is not None:
        bobbin.spindle_number = body.spindle_number

    db.commit()
    db.refresh(bobbin)
    return _simplex_bobbin_payload(bobbin, dept_meta.get("simplex"), dept_meta.get("rsb"))


@app.delete("/api/lab/simplex/{bobbin_id}", status_code=204)
def delete_simplex_bobbin(bobbin_id: int, db: Session = Depends(get_db)):
    bobbin = db.query(LabSimplexBobbin).filter_by(id=bobbin_id).first()
    if not bobbin:
        raise HTTPException(404, "Simplex bobbin not found")
    db.delete(bobbin)
    db.commit()


@app.put("/api/lab/simplex-inputs/{input_id}", response_model=SimplexInputOut)
def update_simplex_input_readings(
    input_id: int,
    body: SimplexInputUpdate,
    db: Session = Depends(get_db),
):
    """
    Store per-link readings for a specific RSB can → Simplex bobbin connection.

    Each (can, bobbin) link tracks its own independent measurements so that the
    same RSB can used across multiple bobbins is evaluated separately for each
    bobbin — analogous to the cop-per-frame independence model.
    """
    link = db.query(LabSimplexInput).filter_by(id=input_id).first()
    if not link:
        raise HTTPException(404, "Simplex input link not found")

    readings = [round(r, 6) for r in body.readings if r is not None]
    _set_reading_fields(link, readings, body.sample_length)
    link.sample_length = body.sample_length
    db.commit()
    db.refresh(link)

    stored_readings = json.loads(link.readings_json) if link.readings_json else []
    return {
        "id":             link.id,
        "bobbin_id":      link.bobbin_id,
        "rsb_can_id":     link.rsb_can_id,
        "sample_length":  link.sample_length,
        "readings":       stored_readings,
        "readings_count": link.readings_count,
        "mean_hank":      link.mean_hank,
        "cv_pct":         link.cv_pct,
    }


@app.post("/api/lab/trials/{trial_id}/flow/ringframe", status_code=201, response_model=RingframeCopOut)
def create_ringframe_cop(
    trial_id: int,
    body: RingframeCopCreate,
    db: Session = Depends(get_db),
):
    _get_trial_or_404(trial_id, db)
    dept_meta = _lab_dept_map(db)
    count = (
        db.query(func.count(LabRingframeCop.id))
        .filter(LabRingframeCop.trial_id == trial_id)
        .scalar()
    )
    # ── Structured ID: {bobbin_label}-{n}  e.g. "1-1-1", "1-1-2", "2-3-1" ───
    provided_label = (body.label or "").strip()
    if provided_label:
        label = provided_label
    elif body.simplex_bobbin_ids:
        first_bobbin = (
            db.query(LabSimplexBobbin)
            .filter(LabSimplexBobbin.id == body.simplex_bobbin_ids[0],
                    LabSimplexBobbin.trial_id == trial_id)
            .first()
        )
        if first_bobbin:
            # Count cops already linked to this bobbin ON THIS SPECIFIC FRAME.
            # A bobbin moved to a different frame starts a new cop sequence (→ 1),
            # while another cop on the same bobbin+frame increments it (→ 2, 3…).
            siblings = (
                db.query(func.count(LabRingframeInput.id))
                .join(LabRingframeCop, LabRingframeInput.cop_id == LabRingframeCop.id)
                .filter(
                    LabRingframeInput.simplex_bobbin_id == first_bobbin.id,
                    LabRingframeCop.trial_id == trial_id,
                    LabRingframeCop.frame_number == body.frame_number,
                )
                .scalar()
            ) or 0
            label = f"{first_bobbin.label}-{siblings + 1}"
        else:
            label = f"C{count + 1}"
    else:
        label = f"C{count + 1}"

    # Guarantee uniqueness within the same trial+frame (handles gaps from deletions).
    # Scoped to frame so that "1-2-1" on Frame 13 and "1-2-1" on Frame 15
    # are both valid and never collide with each other.
    existing_cop_labels = {
        row[0]
        for row in db.query(LabRingframeCop.label)
        .filter(
            LabRingframeCop.trial_id == trial_id,
            LabRingframeCop.frame_number == body.frame_number,
        )
        .all()
    }
    base_label = label
    suffix = 2
    while label in existing_cop_labels:
        label = f"{base_label}-{suffix}"
        suffix += 1
    cop = LabRingframeCop(
        trial_id=trial_id,
        label=label,
        frame_number=body.frame_number,
        spindle_number=body.spindle_number,
        hank_value=body.hank_value,
        notes=body.notes,
        sample_length=body.sample_length,
    )
    db.add(cop)
    db.flush()
    if body.simplex_bobbin_ids:
        _set_ringframe_inputs(cop, body.simplex_bobbin_ids, trial_id, db)
    readings = [round(r, 6) for r in (body.readings or []) if r is not None]
    _set_reading_fields(cop, readings, cop.sample_length)
    db.commit()
    db.refresh(cop)
    return _ringframe_cop_payload(
        cop,
        dept_meta.get("ringframe"),
        dept_meta.get("simplex"),
        dept_meta.get("rsb"),
    )


@app.put("/api/lab/ringframe/{cop_id}", response_model=RingframeCopOut)
def update_ringframe_cop(
    cop_id: int,
    body: RingframeCopUpdate,
    db: Session = Depends(get_db),
):
    dept_meta = _lab_dept_map(db)
    cop = (
        db.query(LabRingframeCop)
        .options(
            joinedload(LabRingframeCop.inputs)
            .joinedload(LabRingframeInput.simplex_bobbin)
            .joinedload(LabSimplexBobbin.inputs)
            .joinedload(LabSimplexInput.rsb_can)
        )
        .filter_by(id=cop_id)
        .first()
    )
    if not cop:
        raise HTTPException(404, "Ring frame cop not found")

    if body.label is not None:
        cop.label = body.label.strip() or cop.label
    if body.frame_number is not None:
        cop.frame_number = body.frame_number
    if body.spindle_number is not None:
        cop.spindle_number = body.spindle_number
    if body.hank_value is not None:
        cop.hank_value = body.hank_value
    if body.notes is not None:
        cop.notes = body.notes
    if body.simplex_bobbin_ids is not None:
        _set_ringframe_inputs(cop, body.simplex_bobbin_ids, cop.trial_id, db)
    if body.sample_length is not None:
        cop.sample_length = body.sample_length
    if body.readings is not None:
        readings = [round(r, 6) for r in body.readings if r is not None]
        _set_reading_fields(cop, readings, cop.sample_length)

    db.commit()
    db.refresh(cop)
    return _ringframe_cop_payload(
        cop,
        dept_meta.get("ringframe"),
        dept_meta.get("simplex"),
        dept_meta.get("rsb"),
    )


@app.delete("/api/lab/ringframe/{cop_id}", status_code=204)
def delete_ringframe_cop(cop_id: int, db: Session = Depends(get_db)):
    cop = db.query(LabRingframeCop).filter_by(id=cop_id).first()
    if not cop:
        raise HTTPException(404, "Ring frame cop not found")
    db.delete(cop)
    db.commit()


# ── Analysis Matrix ────────────────────────────────────────────────────────────
@app.get("/api/lab/trials/{trial_id}/matrix")
def get_lab_matrix(trial_id: int, db: Session = Depends(get_db)):
    """
    Return raw data for the frontend Analysis Matrix Report.
    Returns bobbins, frame numbers, cop↔bobbin cell mappings, and benchmarks.
    All gate computation (count/draft/pattern/CV) happens client-side on demand.
    """
    from sqlalchemy import text as sa_text

    # Verify trial exists
    trial = db.query(LabTrial).filter_by(id=trial_id).first()
    if not trial:
        raise HTTPException(404, "Trial not found")

    # Benchmarks
    bm_rows = db.execute(
        sa_text("SELECT dept_id, target, tolerance FROM lab_benchmarks WHERE trial_id = :tid"),
        {"tid": trial_id},
    ).fetchall()
    benchmarks = {row.dept_id: {"target": row.target, "tolerance": row.tolerance} for row in bm_rows}

    if "ringframe" not in benchmarks:
        raise HTTPException(400, "Ring frame benchmark not set for this trial")
    if "simplex" not in benchmarks:
        raise HTTPException(400, "Simplex benchmark not set for this trial")

    # Simplex bobbins
    bobbin_rows = db.execute(
        sa_text(
            "SELECT id, label, mean_hank AS bobbin_hank, cv_pct AS bobbin_cv, machine_number "
            "FROM lab_simplex_bobbins WHERE trial_id = :tid ORDER BY id"
        ),
        {"tid": trial_id},
    ).fetchall()

    # Cops with their linked bobbin ids (one row per cop↔bobbin link)
    cell_rows = db.execute(
        sa_text(
            """
            SELECT c.id        AS cop_id,
                   c.frame_number,
                   c.mean_hank AS cop_hank,
                   c.cv_pct    AS cop_cv,
                   ri.simplex_bobbin_id AS bobbin_id
            FROM   lab_ringframe_cops c
            LEFT JOIN lab_ringframe_inputs ri ON ri.cop_id = c.id
            WHERE  c.trial_id = :tid
            ORDER  BY c.frame_number, c.id
            """
        ),
        {"tid": trial_id},
    ).fetchall()

    cells = [dict(row._mapping) for row in cell_rows]
    frames = sorted({c["frame_number"] for c in cells if c["frame_number"] is not None})

    return {
        "bobbins": [dict(r._mapping) for r in bobbin_rows],
        "frames":  frames,
        "cells":   cells,
        "benchmarks": benchmarks,
    }


# ── Interaction Report ─────────────────────────────────────────────────────────
@app.get("/api/lab/trials/{trial_id}/interaction-report")
def get_interaction_report(trial_id: int, db: Session = Depends(get_db)):
    """
    Comprehensive interaction report: hierarchy, matrices, variation, and ANOVA.

    Returns:
      bobbins    — flat list for backward-compat matrix/heatmap tables
      frames     — unique frame numbers
      cells      — cop↔bobbin mapping rows
      benchmarks — trial benchmarks
      anova      — ANOVA statistical test results
      hierarchy  — NEW: Can → Bobbin → Cop nested tree with lineage
      variation  — NEW: 4-level hierarchical variation analysis
    """
    from sqlalchemy import text as sa_text
    from stats_engine import run_interaction_anova, run_hierarchical_variation

    trial = db.query(LabTrial).filter_by(id=trial_id).first()
    if not trial:
        raise HTTPException(404, "Trial not found")

    # ── Benchmarks ────────────────────────────────────────────────────────────
    bm_rows = db.execute(
        sa_text("SELECT dept_id, target, tolerance FROM lab_benchmarks WHERE trial_id = :tid"),
        {"tid": trial_id},
    ).fetchall()
    benchmarks = {row.dept_id: {"target": row.target, "tolerance": row.tolerance} for row in bm_rows}

    if "ringframe" not in benchmarks:
        raise HTTPException(400, "Ring frame benchmark not set for this trial")
    if "simplex" not in benchmarks:
        raise HTTPException(400, "Simplex benchmark not set for this trial")

    # ── Load all objects with relationships ───────────────────────────────────
    bobbins_q = (
        db.query(LabSimplexBobbin)
        .options(joinedload(LabSimplexBobbin.inputs).joinedload(LabSimplexInput.rsb_can))
        .filter_by(trial_id=trial_id)
        .order_by(LabSimplexBobbin.order_index.asc(), LabSimplexBobbin.id.asc())
        .all()
    )
    cops_q = (
        db.query(LabRingframeCop)
        .options(joinedload(LabRingframeCop.inputs))
        .filter_by(trial_id=trial_id)
        .order_by(LabRingframeCop.id.asc())
        .all()
    )
    cans_q = (
        db.query(LabRSBCan)
        .filter_by(trial_id=trial_id)
        .order_by(LabRSBCan.slot.asc())
        .all()
    )

    # ── Build flat data for backward-compat tables / heatmap / ANOVA ─────────
    # bobbin flat rows
    bobbin_rows_flat = []
    rsb_by_bobbin: dict[int, list] = {}
    for b in bobbins_q:
        can_links = [
            {"can_id": inp.rsb_can_id, "can_slot": inp.rsb_can.slot,
             "can_hank": inp.rsb_can.mean_hank, "can_cv": inp.rsb_can.cv_pct}
            for inp in sorted(b.inputs, key=lambda x: x.rsb_can.slot if x.rsb_can else 999)
            if inp.rsb_can is not None
        ]
        rsb_by_bobbin[b.id] = can_links
        bobbin_rows_flat.append({
            "id": b.id, "label": b.label,
            "bobbin_hank": b.mean_hank, "bobbin_cv": b.cv_pct,
            "machine_number": b.machine_number, "spindle_number": b.spindle_number,
            "rsb_cans": can_links,
        })

    # cell rows
    cells: list[dict] = []
    bobbin_machine: dict[int, int | None] = {b.id: b.machine_number for b in bobbins_q}
    for cop in cops_q:
        if cop.inputs:
            for inp in cop.inputs:
                cells.append({
                    "cop_id": cop.id, "frame_number": cop.frame_number,
                    "cop_hank": cop.mean_hank, "cop_cv": cop.cv_pct,
                    "bobbin_id": inp.simplex_bobbin_id,
                })
        else:
            cells.append({
                "cop_id": cop.id, "frame_number": cop.frame_number,
                "cop_hank": cop.mean_hank, "cop_cv": cop.cv_pct,
                "bobbin_id": None,
            })

    frames = sorted({c["frame_number"] for c in cells if c["frame_number"] is not None})

    # ANOVA input
    cops_seen: dict[int, dict] = {}
    for c in cells:
        cid = c["cop_id"]
        if cid not in cops_seen:
            machine = bobbin_machine.get(c["bobbin_id"]) if c["bobbin_id"] is not None else None
            cops_seen[cid] = {
                "cop_id": cid, "cop_hank": c["cop_hank"],
                "frame_number": c["frame_number"], "machine_number": machine,
            }
        elif cops_seen[cid]["machine_number"] is None and c["bobbin_id"] is not None:
            cops_seen[cid]["machine_number"] = bobbin_machine.get(c["bobbin_id"])
    anova = run_interaction_anova(list(cops_seen.values()))

    # ── Build hierarchy: Can → Bobbin → Cop ──────────────────────────────────
    # Map: can_id → list of bobbins fed by that can
    can_to_bobbins: dict[int, list] = {}
    for b in bobbins_q:
        for inp in b.inputs:
            if inp.rsb_can_id is not None:
                can_to_bobbins.setdefault(inp.rsb_can_id, [])
                if b not in can_to_bobbins[inp.rsb_can_id]:
                    can_to_bobbins[inp.rsb_can_id].append(b)

    # Map: bobbin_id → list of cops
    bobbin_to_cops: dict[int, list] = {}
    for cop in cops_q:
        for inp in cop.inputs:
            if inp.simplex_bobbin_id is not None:
                bobbin_to_cops.setdefault(inp.simplex_bobbin_id, [])
                if cop not in bobbin_to_cops[inp.simplex_bobbin_id]:
                    bobbin_to_cops[inp.simplex_bobbin_id].append(cop)

    def _cop_node(cop: LabRingframeCop) -> dict:
        sample_len = cop.sample_length or 120.0
        weights = json.loads(cop.readings_json) if cop.readings_json else []
        hanks = [round((sample_len * 0.54) / w, 4) for w in weights if w and w > 0]
        return {
            "cop_id": cop.id, "label": cop.label,
            "frame_number": cop.frame_number, "spindle_number": cop.spindle_number,
            "mean_hank": cop.mean_hank, "cv_pct": cop.cv_pct,
            "n_readings": cop.readings_count,
            "readings_hanks": hanks,
        }

    def _bobbin_node(b: LabSimplexBobbin) -> dict:
        cops = [_cop_node(c) for c in sorted(bobbin_to_cops.get(b.id, []), key=lambda x: x.id)]
        return {
            "bobbin_id": b.id, "label": b.label,
            "machine_number": b.machine_number, "spindle_number": b.spindle_number,
            "mean_hank": b.mean_hank, "cv_pct": b.cv_pct,
            "rsb_cans": rsb_by_bobbin.get(b.id, []),
            "cops": cops,
        }

    linked_bobbin_ids: set[int] = set()
    hierarchy: list[dict] = []
    for can in cans_q:
        can_bobbins = can_to_bobbins.get(can.id, [])
        for b in can_bobbins:
            linked_bobbin_ids.add(b.id)
        bobbin_nodes = [
            _bobbin_node(b)
            for b in sorted(can_bobbins, key=lambda b: (b.order_index, b.id))
        ]
        # Only include cans that have either readings or linked bobbins
        if can.mean_hank is not None or bobbin_nodes:
            hierarchy.append({
                "can_id": can.id, "slot": can.slot, "label": f"Can {can.slot}",
                "mean_hank": can.mean_hank, "cv_pct": can.cv_pct,
                "bobbins": bobbin_nodes,
            })

    # Bobbins not linked to any can
    unlinked = [b for b in bobbins_q if b.id not in linked_bobbin_ids]
    if unlinked:
        hierarchy.append({
            "can_id": None, "slot": None, "label": "Unlinked Bobbins",
            "mean_hank": None, "cv_pct": None,
            "bobbins": [_bobbin_node(b) for b in unlinked],
        })

    # ── 4-level variation analysis ────────────────────────────────────────────
    variation = run_hierarchical_variation(hierarchy)

    return {
        "bobbins":    bobbin_rows_flat,
        "frames":     frames,
        "cells":      cells,
        "benchmarks": benchmarks,
        "anova":      anova,
        "hierarchy":  hierarchy,
        "variation":  variation,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  PRODUCTION MODULE
# ═══════════════════════════════════════════════════════════════════════════════

# Department config: which departments exist in the production module
_PROD_DEPT_CONFIG = {
    "carding":   {"name": "Carding",    "method": "efficiency",  "machines": 3},
    "breaker":   {"name": "Breaker",    "method": "efficiency",  "machines": 1},
    "rsb":       {"name": "RSB",        "method": "efficiency",  "machines": 2},
    "simplex":   {"name": "Simplex",    "method": "hank_meter",  "machines": 3},
    "ringframe": {"name": "Ring Frame", "method": "hank_meter",  "machines": 25},
}


def _calc_efficiency(std_rate: float, efficiency_pct: float, running_hours: float) -> float:
    """primary_kg = std_rate × (efficiency / 100) × hours"""
    return round(std_rate * (efficiency_pct / 100.0) * running_hours, 3)


def _calc_hank_meter(hank_reading: float, spindle_count: int, ne_count: float) -> float:
    """
    primary_kg = (hank_reading × spindle_count / ne_count) × 0.453592
    Derivation:
      1 hank = 840 yards
      Ne = (yards per lb) / 840  →  1 lb = Ne × 840 yards
      total_yards = hank_reading × 840 × spindle_count
      weight_lb   = total_yards / (ne_count × 840)
                  = hank_reading × spindle_count / ne_count
      weight_kg   = weight_lb × 0.453592
    """
    return round((hank_reading * spindle_count / ne_count) * 0.453592, 3)


def _calc_theoretical(spindle_rpm: float, tpi: float,
                       spindle_count: int, ne_count: float,
                       shift_minutes: float = 480.0) -> float:
    """
    Theoretical production from speed inputs (secondary, validation only).
      delivery_speed (yards/min) = spindle_rpm / (tpi × 36)
      total_yards = delivery_speed × shift_minutes × spindle_count
      weight_kg   = total_yards / (ne_count × 840) × 0.453592
    """
    delivery_ypm = spindle_rpm / (tpi * 36.0)
    total_yards  = delivery_ypm * shift_minutes * spindle_count
    return round(total_yards / (ne_count * 840.0) * 0.453592, 3)


def _material_or_404(db: Session, material_id: Optional[int] = None, code: Optional[str] = None) -> Material:
    q = db.query(Material)
    material = q.filter(Material.id == material_id).first() if material_id is not None else q.filter(Material.code == code).first()
    if not material:
        raise HTTPException(404, "Material not found")
    return material


def _post_inventory_movement(
    db: Session,
    *,
    material: Material,
    quantity_delta: float,
    movement_type: str,
    source_type: str,
    source_id: Optional[int] = None,
    movement_date: date,
    unit: Optional[str] = None,
    production_consumption_id: Optional[int] = None,
    material_issue_line_id: Optional[int] = None,
    goods_receipt_line_id: Optional[int] = None,
    notes: Optional[str] = None,
) -> InventoryMovement:
    """Append one ledger row and update cached stock. This is the only stock write path."""
    movement = InventoryMovement(
        material_id=material.id,
        movement_type=movement_type,
        source_type=source_type,
        source_id=source_id,
        production_consumption_id=production_consumption_id,
        material_issue_line_id=material_issue_line_id,
        goods_receipt_line_id=goods_receipt_line_id,
        quantity_delta=round(quantity_delta, 6),
        unit=unit or material.base_unit,
        movement_date=movement_date,
        notes=notes,
        created_at=datetime.now(timezone.utc),
    )
    db.add(movement)
    db.flush()

    stock = db.query(InventoryStock).filter_by(material_id=material.id).first()
    if not stock:
        stock = InventoryStock(material_id=material.id, quantity_on_hand=0.0, unit=unit or material.base_unit)
        db.add(stock)
    stock.quantity_on_hand = round((stock.quantity_on_hand or 0.0) + quantity_delta, 6)
    stock.unit = unit or material.base_unit
    stock.last_movement_id = movement.id
    stock.updated_at = datetime.now(timezone.utc)
    return movement


def _daily_consumption(db: Session, material_id: int, days: int = 7) -> Dict[date, float]:
    start = date.today().toordinal() - days + 1
    rows = (
        db.query(InventoryMovement.movement_date, func.sum(InventoryMovement.quantity_delta))
        .filter(
            InventoryMovement.material_id == material_id,
            InventoryMovement.source_type == "material_issue",
            InventoryMovement.quantity_delta < 0,
            InventoryMovement.movement_date >= date.fromordinal(start),
        )
        .group_by(InventoryMovement.movement_date)
        .all()
    )
    return {r[0]: abs(float(r[1] or 0.0)) for r in rows}


def _avg_consumption(db: Session, material_id: int, days: int = 7) -> float:
    trend = _daily_consumption(db, material_id, days)
    return round(sum(trend.values()) / days, 3) if days else 0.0


def _price_trend(db: Session, material_id: int) -> str:
    prices = (
        db.query(MaterialMarketPrice)
        .filter_by(material_id=material_id)
        .order_by(MaterialMarketPrice.price_date.desc())
        .limit(5)
        .all()
    )
    ordered = list(reversed([p.price for p in prices]))
    if len(ordered) < 2:
        return "unknown"
    if ordered[-1] < ordered[0]:
        return "falling"
    if ordered[-1] > ordered[0]:
        return "rising"
    return "stable"


def _recommendation_payload(r: PurchaseRecommendation) -> dict:
    return {
        "id": r.id,
        "material_id": r.material_id,
        "material_code": r.material.code,
        "material_name": r.material.name,
        "status": r.status,
        "suggested_qty": r.suggested_qty,
        "unit": r.unit,
        "reason": r.reason,
        "decision_support": r.decision_support,
        "stock_at_creation": r.stock_at_creation,
        "reorder_level": r.reorder_level,
        "avg_consumption": r.avg_consumption,
        "price_trend": r.price_trend,
        "created_at": r.created_at,
    }


def _open_recommendation(db: Session, material_id: int) -> Optional[PurchaseRecommendation]:
    return (
        db.query(PurchaseRecommendation)
        .options(joinedload(PurchaseRecommendation.material))
        .filter_by(material_id=material_id, status="open")
        .order_by(PurchaseRecommendation.created_at.desc())
        .first()
    )


def _evaluate_mrp(db: Session, material: Material) -> Optional[PurchaseRecommendation]:
    params = material.planning_params
    stock_row = db.query(InventoryStock).filter_by(material_id=material.id).first()
    stock = stock_row.quantity_on_hand if stock_row else 0.0
    avg = _avg_consumption(db, material.id, 7)
    lead_time = params.lead_time_days if params else 5.0
    safety = params.safety_stock_qty if params else 0.0
    reorder_qty = params.reorder_qty if params else 0.0
    critical_days = params.critical_days_left if params else 2.0
    reorder_level = round(avg * lead_time + safety, 3)
    days_left = stock / avg if avg > 0 else None
    existing = _open_recommendation(db, material.id)
    if stock >= reorder_level or existing:
        return existing

    trend = _price_trend(db, material.id)
    critical = days_left is not None and days_left <= critical_days
    if critical:
        support = "Stock critical: order immediately."
    elif trend == "falling":
        support = "Price falling: order minimum required."
    elif trend == "rising":
        support = "Price rising: consider higher quantity."
    else:
        support = "Price trend unavailable: order planned quantity."

    suggested = reorder_qty or max(reorder_level - stock, 0.0)
    rec = PurchaseRecommendation(
        material_id=material.id,
        status="open",
        suggested_qty=round(suggested, 3),
        unit=material.base_unit,
        reason="Stock below reorder level",
        decision_support=support,
        stock_at_creation=round(stock, 3),
        reorder_level=reorder_level,
        avg_consumption=avg,
        price_trend=trend,
        created_at=datetime.now(timezone.utc),
    )
    db.add(rec)
    db.flush()
    return rec


def _production_entry_payload(entry: ProductionEntry) -> dict:
    return {
        "id": entry.id,
        "dept_id": entry.dept_id,
        "shift": entry.shift,
        "entry_date": entry.entry_date,
        "machine_number": entry.machine_number,
        "calc_method": entry.calc_method,
        "efficiency_pct": entry.efficiency_pct,
        "running_hours": entry.running_hours,
        "std_rate_kg_per_hr": entry.std_rate_kg_per_hr,
        "hank_reading": entry.hank_reading,
        "spindle_count": entry.spindle_count,
        "ne_count": entry.ne_count,
        "spindle_rpm": entry.spindle_rpm,
        "tpi": entry.tpi,
        "primary_kg": entry.primary_kg,
        "theoretical_kg": entry.theoretical_kg,
        "notes": entry.notes,
        "recorded_at": entry.recorded_at,
        "created_at": entry.created_at,
        "is_void": entry.is_void,
    }


def _material_issue_payload(doc: MaterialIssueDocument) -> dict:
    return {
        "id": doc.id,
        "document_number": doc.document_number,
        "issue_date": doc.issue_date,
        "shift": doc.shift,
        "reference": doc.reference,
        "status": doc.status,
        "created_at": doc.created_at,
        "lines": [{
            "id": line.id,
            "material_id": line.material_id,
            "material_code": line.material.code,
            "material_name": line.material.name,
            "quantity": line.quantity,
            "unit": line.unit,
            "movement_type": line.movement_type,
        } for line in doc.lines],
    }


# ── Standard Rates ────────────────────────────────────────────────────────────

@app.get("/api/production/std-rates", response_model=List[ProductionStdRateOut])
def get_production_std_rates(db: Session = Depends(get_db)):
    """Return all stored standard production rates."""
    return db.query(ProductionStdRate).order_by(
        ProductionStdRate.dept_id, ProductionStdRate.machine_number
    ).all()


@app.put("/api/production/std-rates/{dept_id}", response_model=ProductionStdRateOut)
def update_production_std_rate(
    dept_id: str,
    body: ProductionStdRateUpdate,
    db: Session = Depends(get_db),
):
    """Upsert a standard rate for (dept_id, machine_number). machine_number=None = dept default."""
    machine_number = body.machine_number

    row = (
        db.query(ProductionStdRate)
        .filter(
            ProductionStdRate.dept_id == dept_id,
            ProductionStdRate.machine_number == machine_number,
        )
        .first()
    )

    if not row:
        row = ProductionStdRate(dept_id=dept_id, machine_number=machine_number)
        db.add(row)

    row.std_rate_kg_per_hr = body.std_rate_kg_per_hr
    if body.label is not None:
        row.label = body.label
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return row


# ── Production Entries ────────────────────────────────────────────────────────

@app.post("/api/production/entries", response_model=ProductionEntryOut, status_code=201)
def create_production_entry(body: ProductionEntryCreate, db: Session = Depends(get_db)):
    """
    Submit a shift production entry.  Calculates primary_kg server-side so the
    formula is always authoritative regardless of client-side JS.
    """
    dept_cfg = _PROD_DEPT_CONFIG.get(body.dept_id)
    if not dept_cfg:
        raise HTTPException(400, f"Unknown production department: {body.dept_id}")

    now = datetime.now(timezone.utc)
    recorded_at = body.recorded_at or now

    entry = ProductionEntry(
        dept_id        = body.dept_id,
        shift          = body.shift,
        entry_date     = body.entry_date,
        machine_number = body.machine_number,
        calc_method    = body.calc_method,
        notes          = body.notes,
        recorded_at    = recorded_at,
        created_at     = now,
    )

    if body.calc_method == "efficiency":
        # Fetch std rate: prefer machine-specific, fall back to dept default
        std_rate_row = None
        if body.machine_number is not None:
            std_rate_row = (
                db.query(ProductionStdRate)
                .filter_by(dept_id=body.dept_id, machine_number=body.machine_number)
                .first()
            )
        if std_rate_row is None:
            std_rate_row = (
                db.query(ProductionStdRate)
                .filter(
                    ProductionStdRate.dept_id == body.dept_id,
                    ProductionStdRate.machine_number == None,
                )
                .first()
            )

        # Body can override the stored rate
        std_rate = (
            body.std_rate_kg_per_hr
            if body.std_rate_kg_per_hr is not None
            else (std_rate_row.std_rate_kg_per_hr if std_rate_row else 0.0)
        )

        entry.efficiency_pct     = body.efficiency_pct
        entry.running_hours      = body.running_hours
        entry.std_rate_kg_per_hr = std_rate
        entry.primary_kg         = _calc_efficiency(std_rate, body.efficiency_pct, body.running_hours)

    else:  # hank_meter
        entry.hank_reading  = body.hank_reading
        entry.spindle_count = body.spindle_count
        entry.ne_count      = body.ne_count
        entry.primary_kg    = _calc_hank_meter(body.hank_reading, body.spindle_count, body.ne_count)

        # Optional theoretical
        if body.spindle_rpm is not None and body.tpi is not None:
            entry.spindle_rpm    = body.spindle_rpm
            entry.tpi            = body.tpi
            entry.theoretical_kg = _calc_theoretical(
                body.spindle_rpm, body.tpi, body.spindle_count, body.ne_count
            )

    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _production_entry_payload(entry)


@app.get("/api/production/entries", response_model=List[ProductionEntryOut])
def list_production_entries(
    dept_id:        Optional[str]  = None,
    shift:          Optional[str]  = None,
    entry_date:     Optional[date] = None,
    machine_number: Optional[int]  = None,
    limit:          int            = 200,
    db: Session = Depends(get_db),
):
    q = db.query(ProductionEntry).filter(ProductionEntry.is_void == False)
    if dept_id:
        q = q.filter(ProductionEntry.dept_id == dept_id)
    if shift:
        q = q.filter(ProductionEntry.shift == shift)
    if entry_date:
        q = q.filter(ProductionEntry.entry_date == entry_date)
    if machine_number is not None:
        q = q.filter(ProductionEntry.machine_number == machine_number)
    rows = (
        q.order_by(ProductionEntry.entry_date.desc(), ProductionEntry.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_production_entry_payload(e) for e in rows]


@app.delete("/api/production/entries/{entry_id}", status_code=204)
def delete_production_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(ProductionEntry).filter_by(id=entry_id).first()
    if not entry:
        raise HTTPException(404, "Production entry not found")
    if entry.is_void:
        return
    now = datetime.now(timezone.utc)
    entry.is_void = True
    entry.voided_at = now
    entry.void_reason = "Voided from production log"
    db.commit()


# ── Dashboard summary ─────────────────────────────────────────────────────────

@app.get("/api/production/dashboard", response_model=ProductionDashboardOut)
def production_dashboard(
    target_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """
    Today's (or target_date's) production summary per department — total kg and
    shift breakdown.  Used by the Production Dashboard KPI tiles.
    """
    d = target_date or date.today()

    rows = (
        db.query(
            ProductionEntry.dept_id,
            ProductionEntry.shift,
            func.sum(ProductionEntry.primary_kg).label("total_kg"),
        )
        .filter(ProductionEntry.entry_date == d, ProductionEntry.is_void == False)
        .group_by(ProductionEntry.dept_id, ProductionEntry.shift)
        .all()
    )

    # Aggregate into dept → shift buckets
    by_dept: Dict[str, Dict[str, float]] = {}
    for row in rows:
        if row.dept_id not in by_dept:
            by_dept[row.dept_id] = {"A": 0.0, "B": 0.0, "C": 0.0}
        by_dept[row.dept_id][row.shift] = round(row.total_kg or 0.0, 2)

    entry_counts = (
        db.query(ProductionEntry.dept_id, func.count(ProductionEntry.id))
        .filter(ProductionEntry.entry_date == d, ProductionEntry.is_void == False)
        .group_by(ProductionEntry.dept_id)
        .all()
    )
    count_map = {r[0]: r[1] for r in entry_counts}

    dept_summaries: List[ProductionDeptSummary] = []
    for dept_id, cfg in _PROD_DEPT_CONFIG.items():
        shifts = by_dept.get(dept_id, {"A": 0.0, "B": 0.0, "C": 0.0})
        today_kg = shifts["A"] + shifts["B"] + shifts["C"]
        dept_summaries.append(ProductionDeptSummary(
            dept_id     = dept_id,
            dept_name   = cfg["name"],
            calc_method = cfg["method"],
            today_kg    = round(today_kg, 2),
            shift_a_kg  = shifts["A"],
            shift_b_kg  = shifts["B"],
            shift_c_kg  = shifts["C"],
            entry_count = count_map.get(dept_id, 0),
        ))

    total_kg = sum(d.today_kg for d in dept_summaries)
    return ProductionDashboardOut(
        date     = str(d),
        depts    = dept_summaries,
        total_kg = round(total_kg, 2),
    )


# ── Inventory / MRP / Purchasing ─────────────────────────────────────────────

@app.get("/api/materials", response_model=List[MaterialOut])
def list_materials(db: Session = Depends(get_db)):
    return db.query(Material).filter_by(is_active=True).order_by(Material.name).all()


@app.post("/api/materials", response_model=MaterialOut, status_code=201)
def create_material(body: MaterialCreate, db: Session = Depends(get_db)):
    """Create a new material in the master list."""
    # Check for duplicate code (case-insensitive)
    existing = db.query(Material).filter(
        Material.code.ilike(body.code.strip())
    ).first()
    if existing:
        raise HTTPException(409, f"Material code '{body.code}' already exists")

    now = datetime.now(timezone.utc)
    material = Material(
        code=body.code.strip().upper(),
        name=body.name.strip(),
        base_unit=body.base_unit.strip(),
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db.add(material)
    db.commit()
    db.refresh(material)
    return material


@app.delete("/api/materials/{material_id}", status_code=204)
def deactivate_material(material_id: int, db: Session = Depends(get_db)):
    """Soft-delete a material (marks is_active=False). Cannot delete if stock exists."""
    material = _material_or_404(db, material_id)
    stock = db.query(InventoryStock).filter_by(material_id=material.id).first()
    if stock and stock.quantity_on_hand > 0:
        raise HTTPException(400, f"Cannot deactivate '{material.name}' — stock on hand: {stock.quantity_on_hand:g} {material.base_unit}")
    material.is_active = False
    material.updated_at = datetime.now(timezone.utc)
    db.commit()


@app.get("/api/inventory/overview", response_model=List[InventoryOverviewItem])
def inventory_overview(db: Session = Depends(get_db)):
    materials = (
        db.query(Material)
        .options(joinedload(Material.stock), joinedload(Material.planning_params))
        .filter_by(is_active=True)
        .order_by(Material.name)
        .all()
    )
    out = []
    for material in materials:
        try:
            # _evaluate_mrp may write to purchase_recommendations; guard so one
            # failing material never crashes the entire overview response.
            rec = _evaluate_mrp(db, material)
        except Exception:
            rec = None
        try:
            stock = material.stock.quantity_on_hand if material.stock else 0.0
            params = material.planning_params
            avg = _avg_consumption(db, material.id, 7)
            daily = _daily_consumption(db, material.id, 1).get(date.today(), 0.0)
            lead = params.lead_time_days if params else 5.0
            safety = params.safety_stock_qty if params else 0.0
            reorder_qty = params.reorder_qty if params else 0.0
            reorder_level = round(avg * lead + safety, 3)
            days_left = round(stock / avg, 1) if avg > 0 else None
            status = "BELOW REORDER LEVEL" if stock < reorder_level else ("SAFE (CLOSE)" if stock <= reorder_level * 1.15 and reorder_level > 0 else "SAFE")
            action = "ORDER NOW" if stock < reorder_level else "MONITOR"
            price_trend = _price_trend(db, material.id)
        except Exception:
            # Return a safe placeholder row so the material still appears in the UI
            stock = 0.0; avg = 0.0; daily = 0.0; lead = 5.0; safety = 0.0
            reorder_qty = 0.0; reorder_level = 0.0; days_left = None
            status = "SAFE"; action = "MONITOR"; price_trend = "stable"
        out.append({
            "material_id": material.id,
            "material_code": material.code,
            "material_name": material.name,
            "unit": material.base_unit,
            "stock": round(stock, 3),
            "daily_consumption": round(daily, 3),
            "avg_consumption_7d": avg,
            "days_left": days_left,
            "lead_time_days": lead,
            "safety_stock_qty": safety,
            "reorder_qty": reorder_qty,
            "reorder_level": reorder_level,
            "status": status,
            "action": action,
            "price_trend": price_trend,
            "recommendation": _recommendation_payload(rec) if rec else None,
        })
    try:
        db.commit()
    except Exception:
        db.rollback()
    return out


@app.get("/api/inventory/movements", response_model=List[InventoryMovementOut])
def list_inventory_movements(
    material_id: Optional[int] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    q = db.query(InventoryMovement).options(joinedload(InventoryMovement.material))
    if material_id:
        q = q.filter(InventoryMovement.material_id == material_id)
    rows = q.order_by(InventoryMovement.created_at.desc()).limit(limit).all()
    return [{
        "id": r.id,
        "material_id": r.material_id,
        "material_code": r.material.code,
        "material_name": r.material.name,
        "movement_type": r.movement_type,
        "source_type": r.source_type,
        "source_id": r.source_id,
        "quantity_delta": r.quantity_delta,
        "unit": r.unit,
        "movement_date": r.movement_date,
        "notes": r.notes,
        "created_at": r.created_at,
    } for r in rows]


@app.post("/api/inventory/material-issues", response_model=MaterialIssueOut, status_code=201)
def post_material_issue(body: MaterialIssueCreate, db: Session = Depends(get_db)):
    """
    Post a SAP-style goods issue document. Inventory owns consumption; production
    entries are only an operational reference through date/shift/reference.
    """
    now = datetime.now(timezone.utc)
    doc = MaterialIssueDocument(
        document_number=f"GI-{now.strftime('%Y%m%d%H%M%S')}",
        issue_date=body.issue_date,
        shift=body.shift,
        reference=body.reference or "Daily Production",
        status="posted",
        notes=body.notes,
        created_at=now,
    )
    db.add(doc)
    db.flush()

    for item in body.lines:
        material = _material_or_404(db, item.material_id)
        stock = db.query(InventoryStock).filter_by(material_id=material.id).first()
        on_hand = stock.quantity_on_hand if stock else 0.0
        if item.quantity > on_hand + 1e-9:
            raise HTTPException(400, f"Insufficient stock for {material.name}: {on_hand:g} {material.base_unit} available")

        line = MaterialIssueLine(
            document_id=doc.id,
            material_id=material.id,
            quantity=item.quantity,
            unit=material.base_unit,
            movement_type="GI",
        )
        db.add(line)
        db.flush()
        _post_inventory_movement(
            db,
            material=material,
            quantity_delta=-item.quantity,
            movement_type="issue",
            source_type="material_issue",
            source_id=doc.id,
            material_issue_line_id=line.id,
            movement_date=body.issue_date,
            unit=material.base_unit,
            notes=f"Goods issue {doc.document_number} ({doc.reference})",
        )
        _evaluate_mrp(db, material)

    db.commit()
    doc = (
        db.query(MaterialIssueDocument)
        .options(joinedload(MaterialIssueDocument.lines).joinedload(MaterialIssueLine.material))
        .filter_by(id=doc.id)
        .first()
    )
    return _material_issue_payload(doc)


@app.get("/api/inventory/material-issues", response_model=List[MaterialIssueOut])
def list_material_issues(limit: int = 100, db: Session = Depends(get_db)):
    rows = (
        db.query(MaterialIssueDocument)
        .options(joinedload(MaterialIssueDocument.lines).joinedload(MaterialIssueLine.material))
        .order_by(MaterialIssueDocument.issue_date.desc(), MaterialIssueDocument.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_material_issue_payload(doc) for doc in rows]


@app.put("/api/materials/{material_id}/planning", response_model=InventoryOverviewItem)
def update_material_planning(material_id: int, body: MaterialPlanningParamUpdate, db: Session = Depends(get_db)):
    material = _material_or_404(db, material_id)
    params = db.query(MaterialPlanningParam).filter_by(material_id=material.id).first()
    if not params:
        params = MaterialPlanningParam(material_id=material.id)
        db.add(params)
    params.lead_time_days = body.lead_time_days
    params.safety_stock_qty = body.safety_stock_qty
    params.reorder_qty = body.reorder_qty
    params.critical_days_left = body.critical_days_left
    params.updated_at = datetime.now(timezone.utc)
    db.commit()
    overview = inventory_overview(db)
    return next(item for item in overview if item["material_id"] == material_id)


@app.post("/api/materials/{material_id}/market-prices", response_model=MaterialMarketPriceOut, status_code=201)
def add_market_price(material_id: int, body: MaterialMarketPriceCreate, db: Session = Depends(get_db)):
    material = _material_or_404(db, material_id)
    existing = db.query(MaterialMarketPrice).filter_by(material_id=material.id, price_date=body.price_date).first()
    if existing:
        existing.price = body.price
        existing.unit = body.unit or material.base_unit
        row = existing
    else:
        row = MaterialMarketPrice(
            material_id=material.id,
            price_date=body.price_date,
            price=body.price,
            unit=body.unit or material.base_unit,
            created_at=datetime.now(timezone.utc),
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


@app.get("/api/purchase/recommendations", response_model=List[PurchaseRecommendationOut])
def list_purchase_recommendations(status: Optional[str] = "open", db: Session = Depends(get_db)):
    for material in db.query(Material).options(joinedload(Material.planning_params)).filter_by(is_active=True).all():
        _evaluate_mrp(db, material)
    db.commit()
    q = db.query(PurchaseRecommendation).options(joinedload(PurchaseRecommendation.material))
    if status:
        q = q.filter(PurchaseRecommendation.status == status)
    return [_recommendation_payload(r) for r in q.order_by(PurchaseRecommendation.created_at.desc()).all()]


def _po_payload(po: PurchaseOrder) -> dict:
    return {
        "id": po.id,
        "po_number": po.po_number,
        "supplier": po.supplier,
        "status": po.status,
        "order_date": po.order_date,
        "created_at": po.created_at,
        "lines": [{
            "id": line.id,
            "recommendation_id": line.recommendation_id,
            "material_id": line.material_id,
            "material_code": line.material.code,
            "material_name": line.material.name,
            "quantity_ordered": line.quantity_ordered,
            "quantity_received": line.quantity_received,
            "unit": line.unit,
            "rate": line.rate,
        } for line in po.lines],
    }


@app.post("/api/purchase/recommendations/{recommendation_id}/convert-to-po", response_model=PurchaseOrderOut, status_code=201)
def convert_recommendation_to_po(
    recommendation_id: int,
    body: PurchaseOrderCreate,
    db: Session = Depends(get_db),
):
    rec = (
        db.query(PurchaseRecommendation)
        .options(joinedload(PurchaseRecommendation.material))
        .filter_by(id=recommendation_id)
        .first()
    )
    if not rec:
        raise HTTPException(404, "Purchase recommendation not found")
    if rec.status != "open":
        raise HTTPException(400, "Recommendation is not open")

    today = date.today()
    po = PurchaseOrder(
        po_number=f"PO-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        supplier=body.supplier,
        status="open",
        order_date=body.order_date or today,
        created_at=datetime.now(timezone.utc),
    )
    db.add(po)
    db.flush()
    line = PurchaseOrderLine(
        purchase_order_id=po.id,
        recommendation_id=rec.id,
        material_id=rec.material_id,
        quantity_ordered=body.quantity or rec.suggested_qty,
        unit=rec.unit,
        rate=body.rate,
        quantity_received=0.0,
    )
    db.add(line)
    rec.status = "converted"
    rec.converted_at = datetime.now(timezone.utc)
    db.commit()
    po = db.query(PurchaseOrder).options(joinedload(PurchaseOrder.lines).joinedload(PurchaseOrderLine.material)).filter_by(id=po.id).first()
    return _po_payload(po)


@app.get("/api/purchase/orders", response_model=List[PurchaseOrderOut])
def list_purchase_orders(db: Session = Depends(get_db)):
    rows = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.lines).joinedload(PurchaseOrderLine.material))
        .order_by(PurchaseOrder.created_at.desc())
        .all()
    )
    return [_po_payload(po) for po in rows]


@app.post("/api/purchase/orders/{po_id}/receive", response_model=GoodsReceiptOut, status_code=201)
def receive_purchase_order(po_id: int, body: GoodsReceiptCreate, db: Session = Depends(get_db)):
    po = db.query(PurchaseOrder).filter_by(id=po_id).first()
    if not po:
        raise HTTPException(404, "Purchase order not found")
    gr = GoodsReceipt(
        gr_number=f"GR-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        purchase_order_id=po.id,
        receipt_date=body.receipt_date or date.today(),
        notes=body.notes,
        created_at=datetime.now(timezone.utc),
    )
    db.add(gr)
    db.flush()
    for item in body.lines:
        po_line = db.query(PurchaseOrderLine).options(joinedload(PurchaseOrderLine.material)).filter_by(id=item.po_line_id, purchase_order_id=po.id).first()
        if not po_line:
            raise HTTPException(404, f"PO line {item.po_line_id} not found")
        remaining = po_line.quantity_ordered - po_line.quantity_received
        if item.quantity_received > remaining + 1e-9:
            raise HTTPException(400, f"Receipt exceeds remaining quantity for line {po_line.id}")
        rate = item.rate or po_line.rate
        gr_line = GoodsReceiptLine(
            goods_receipt_id=gr.id,
            purchase_order_line_id=po_line.id,
            material_id=po_line.material_id,
            quantity_received=item.quantity_received,
            unit=po_line.unit,
            rate=rate,
        )
        db.add(gr_line)
        db.flush()
        po_line.quantity_received = round(po_line.quantity_received + item.quantity_received, 6)
        _post_inventory_movement(
            db,
            material=po_line.material,
            quantity_delta=item.quantity_received,
            movement_type="receipt",
            source_type="goods_receipt",
            source_id=gr.id,
            goods_receipt_line_id=gr_line.id,
            movement_date=gr.receipt_date,
            unit=po_line.unit,
            notes=f"Goods receipt {gr.gr_number} for {po.po_number}",
        )
        _evaluate_mrp(db, po_line.material)
    if all(line.quantity_received >= line.quantity_ordered for line in po.lines):
        po.status = "received"
    else:
        po.status = "partial"
    db.commit()
    return {
        "id": gr.id,
        "gr_number": gr.gr_number,
        "purchase_order_id": gr.purchase_order_id,
        "receipt_date": gr.receipt_date,
        "created_at": gr.created_at,
    }


@app.post("/api/inventory/quick-receipt", response_model=QuickReceiptOut, status_code=201)
def quick_receipt(body: QuickReceiptCreate, db: Session = Depends(get_db)):
    """
    Direct stock receipt without a purchase order.
    Used for bootstrapping initial inventory or ad-hoc receipts.
    Each line posts a positive inventory_movement of type 'receipt' / source 'quick_receipt'.
    """
    now = datetime.now(timezone.utc)
    receipt_date = body.receipt_date or date.today()
    gr_number = f"GR-{now.strftime('%Y%m%d%H%M%S')}"

    for item in body.lines:
        material = _material_or_404(db, item.material_id)
        _post_inventory_movement(
            db,
            material=material,
            quantity_delta=item.quantity,
            movement_type="receipt",
            source_type="quick_receipt",
            source_id=None,          # no parent PO — this is a direct/opening stock receipt
            movement_date=receipt_date,
            unit=material.base_unit,
            notes=f"{gr_number}: {body.reference or 'Direct material receipt'}",
        )
        _evaluate_mrp(db, material)

    db.commit()
    return {
        "gr_number": gr_number,
        "receipt_date": receipt_date,
        "lines_posted": len(body.lines),
        "created_at": now,
    }

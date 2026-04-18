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
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import (
    Department,
    LabBenchmark,
    LabRSBCan,
    LabRingframeCop,
    LabRingframeInput,
    LabSample,
    LabSimplexBobbin,
    LabSimplexInput,
    LabTrial,
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
    PredictRequest,
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
        "rsb_cans":           [_rsb_can_payload(inp.rsb_can, rsb_dept) for inp in links],
        "created_at":         b.created_at,
        "readings":           readings,
        "readings_count":     b.readings_count,
        "mean_hank":          b.mean_hank,
        "cv_pct":             b.cv_pct,
        "status":             _unit_status(b.mean_hank, b.cv_pct, simplex_dept),
        "machine_number":     b.machine_number,
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
def get_uster(db: Session = Depends(get_db)):
    """Uster table driven from departments.uster_p* columns."""
    rows = []
    for dept in _ordered_depts(db):
        batch_means = _batch_means(dept.dept_id, None, db)
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
    # Auto-derive label from the primary RSB can slot so bobbin names always
    # match their source can (e.g. Can 3 → "Bobbin 3").
    # Falls back to sequential numbering only when no can is linked yet.
    label = f"Bobbin {count + 1}"
    if body.rsb_can_ids:
        first_can = (
            db.query(LabRSBCan)
            .filter(LabRSBCan.trial_id == trial_id, LabRSBCan.id == body.rsb_can_ids[0])
            .first()
        )
        if first_can:
            label = f"Bobbin {first_can.slot}"
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
        # Auto-rename: label always tracks the primary (first) linked RSB can slot.
        # This overrides any manually supplied body.label so naming stays consistent.
        if body.rsb_can_ids:
            first_can = (
                db.query(LabRSBCan)
                .filter(LabRSBCan.trial_id == bobbin.trial_id, LabRSBCan.id == body.rsb_can_ids[0])
                .first()
            )
            if first_can:
                bobbin.label = f"Bobbin {first_can.slot}"
    elif body.label is not None:
        # Only allow a manual label when no can linkage is being set in this request
        bobbin.label = body.label.strip() or bobbin.label
    if body.readings is not None:
        readings = [round(r, 6) for r in body.readings if r is not None]
        _set_reading_fields(bobbin, readings, bobbin.sample_length)
    if body.machine_number is not None:
        bobbin.machine_number = body.machine_number

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
    provided_label = (body.label or "").strip()
    label = provided_label or f"Cop {count + 1}"
    cop = LabRingframeCop(
        trial_id=trial_id,
        label=label,
        frame_number=body.frame_number,
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
    Return matrix data + ANOVA results for the Bobbin–Frame Interaction Report.
    The response extends the /matrix payload with an 'anova' key containing
    statistical analysis (frame effect, machine effect, interaction effect).
    """
    from sqlalchemy import text as sa_text
    from stats_engine import run_interaction_anova

    trial = db.query(LabTrial).filter_by(id=trial_id).first()
    if not trial:
        raise HTTPException(404, "Trial not found")

    bm_rows = db.execute(
        sa_text("SELECT dept_id, target, tolerance FROM lab_benchmarks WHERE trial_id = :tid"),
        {"tid": trial_id},
    ).fetchall()
    benchmarks = {row.dept_id: {"target": row.target, "tolerance": row.tolerance} for row in bm_rows}

    if "ringframe" not in benchmarks:
        raise HTTPException(400, "Ring frame benchmark not set for this trial")
    if "simplex" not in benchmarks:
        raise HTTPException(400, "Simplex benchmark not set for this trial")

    bobbin_rows = db.execute(
        sa_text(
            "SELECT id, label, mean_hank AS bobbin_hank, cv_pct AS bobbin_cv, machine_number "
            "FROM lab_simplex_bobbins WHERE trial_id = :tid ORDER BY id"
        ),
        {"tid": trial_id},
    ).fetchall()

    cell_rows = db.execute(
        sa_text(
            """
            SELECT c.id          AS cop_id,
                   c.frame_number,
                   c.mean_hank   AS cop_hank,
                   c.cv_pct      AS cop_cv,
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

    # Build bobbin id → machine_number lookup for ANOVA input
    bobbin_machine = {r.id: r.machine_number for r in bobbin_rows}

    # Construct cops_data for ANOVA: one entry per unique cop with its machine source
    cops_seen: dict[int, dict] = {}
    for c in cells:
        cid = c["cop_id"]
        if cid not in cops_seen:
            machine = bobbin_machine.get(c["bobbin_id"]) if c["bobbin_id"] is not None else None
            cops_seen[cid] = {
                "cop_id":        cid,
                "cop_hank":      c["cop_hank"],
                "frame_number":  c["frame_number"],
                "machine_number": machine,
            }
        elif cops_seen[cid]["machine_number"] is None and c["bobbin_id"] is not None:
            # If a cop links multiple bobbins, use first non-null machine
            cops_seen[cid]["machine_number"] = bobbin_machine.get(c["bobbin_id"])

    anova = run_interaction_anova(list(cops_seen.values()))

    # RSB can lineage: which cans fed each bobbin (slot, hank, cv)
    rsb_lineage_rows = db.execute(
        sa_text(
            """
            SELECT si.bobbin_id,
                   rc.id       AS can_id,
                   rc.slot     AS can_slot,
                   rc.mean_hank AS can_hank,
                   rc.cv_pct   AS can_cv
            FROM   lab_simplex_inputs si
            JOIN   lab_rsb_cans rc ON rc.id = si.rsb_can_id
            WHERE  rc.trial_id = :tid
            ORDER  BY si.bobbin_id, rc.slot
            """
        ),
        {"tid": trial_id},
    ).fetchall()

    rsb_by_bobbin: dict[int, list] = {}
    for row in rsb_lineage_rows:
        rsb_by_bobbin.setdefault(row.bobbin_id, []).append({
            "can_id":   row.can_id,
            "can_slot": row.can_slot,
            "can_hank": row.can_hank,
            "can_cv":   row.can_cv,
        })

    bobbins_out = []
    for r in bobbin_rows:
        d = dict(r._mapping)
        d["rsb_cans"] = rsb_by_bobbin.get(r.id, [])
        bobbins_out.append(d)

    return {
        "bobbins":    bobbins_out,
        "frames":     frames,
        "cells":      cells,
        "benchmarks": benchmarks,
        "anova":      anova,
    }

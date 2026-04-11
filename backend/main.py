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
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Department, LabBenchmark, LabSample, LabTrial, Sample, SettingsVersion
from schemas import (
    Alert,
    DeptKPI,
    ErrorResponse,
    IIRequest,
    IIResponse,
    LabBenchmarkItem,
    LabSampleCreate,
    LabTrialCreate,
    LabTrialUpdate,
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
    order    = ["carding", "breaker", "rsb", "simplex", "ringframe", "autoconer"]
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

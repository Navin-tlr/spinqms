"""Initial normalized schema with departments, settings_versions, samples.

Handles both fresh installs and upgrades from the v1 flat schema
(department_settings + samples with snapshot float columns).

Revision ID: 001
Revises: –
Create Date: 2025-01-01
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from typing import Union, Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels = None
depends_on = None

# ── Factory defaults (used for seeding and old-schema data migration) ─────────
_DEPT_DEFAULTS = [
    {
        "dept_id": "carding",   "name": "Carding",     "short": "Card.",
        "unit": "hank",  "def_len": 6.0,  "frequency": "Every 2 hours",
        "target": 0.120, "tolerance": 0.010,
        "uster_p5": 1.5, "uster_p25": 2.2, "uster_p50": 3.0,
        "uster_p75": 3.8, "uster_p95": 5.5,
    },
    {
        "dept_id": "breaker",   "name": "Breaker/RSB", "short": "Breaker",
        "unit": "hank",  "def_len": 6.0,  "frequency": "Every 1 hour",
        "target": 0.120, "tolerance": 0.010,
        "uster_p5": 1.2, "uster_p25": 1.8, "uster_p50": 2.5,
        "uster_p75": 3.2, "uster_p95": 4.8,
    },
    {
        "dept_id": "rsb",       "name": "RSB",         "short": "RSB",
        "unit": "hank",  "def_len": 6.0,  "frequency": "Every 30 mins",
        "target": 0.120, "tolerance": 0.010,
        "uster_p5": 1.0, "uster_p25": 1.5, "uster_p50": 2.2,
        "uster_p75": 2.9, "uster_p95": 4.2,
    },
    {
        "dept_id": "simplex",   "name": "Simplex",     "short": "Simplex",
        "unit": "hank",  "def_len": 6.0,  "frequency": "Every 2 hours",
        "target": 1.120, "tolerance": 0.100,
        "uster_p5": 2.0, "uster_p25": 2.8, "uster_p50": 3.5,
        "uster_p75": 4.5, "uster_p95": 6.5,
    },
    {
        "dept_id": "ringframe", "name": "Ring Frame",  "short": "R/Frame",
        "unit": "Ne",    "def_len": 120.0, "frequency": "Per doff",
        "target": 47.5,  "tolerance": 0.5,
        "uster_p5": 1.5, "uster_p25": 2.0, "uster_p50": 2.8,
        "uster_p75": 3.5, "uster_p95": 5.0,
    },
    {
        "dept_id": "autoconer", "name": "Autoconer",   "short": "Autoconer",
        "unit": "Ne",    "def_len": 120.0, "frequency": "Per doff",
        "target": 47.0,  "tolerance": 0.5,
        "uster_p5": 1.8, "uster_p25": 2.4, "uster_p50": 3.2,
        "uster_p75": 4.0, "uster_p95": 5.8,
    },
]
_DEFAULTS_BY_ID = {d["dept_id"]: d for d in _DEPT_DEFAULTS}


def _welford_cv(readings):
    """Compute CV% via Welford's — used during migration to populate cv_pct."""
    n, mean, M2 = 0, 0.0, 0.0
    for x in readings:
        n += 1
        delta = x - mean
        mean += delta / n
        M2 += delta * (x - mean)
    if n < 2 or mean == 0:
        return None
    sd = math.sqrt(M2 / (n - 1))
    return (sd / mean) * 100.0


def upgrade() -> None:
    conn = op.get_bind()

    # ── Detect old schema ─────────────────────────────────────────────────────
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())
    has_old_dept_settings = "department_settings" in existing_tables
    has_old_samples       = "samples" in existing_tables

    # Detect whether old samples table has the snapshot float columns
    old_samples_has_snapshots = False
    if has_old_samples:
        old_cols = {c["name"] for c in inspector.get_columns("samples")}
        old_samples_has_snapshots = "target_value" in old_cols

    # ── 1. Create departments table ───────────────────────────────────────────
    if "departments" not in existing_tables:
        op.create_table(
            "departments",
            sa.Column("id",         sa.Integer,  primary_key=True),
            sa.Column("dept_id",    sa.String,   nullable=False, unique=True),
            sa.Column("name",       sa.String,   nullable=False),
            sa.Column("short",      sa.String,   nullable=False),
            sa.Column("unit",       sa.String,   nullable=False),
            sa.Column("def_len",    sa.Float,    nullable=False),
            sa.Column("frequency",  sa.String,   nullable=False),
            sa.Column("target",     sa.Float,    nullable=False),
            sa.Column("tolerance",  sa.Float,    nullable=False),
            sa.Column("uster_p5",   sa.Float,    nullable=False),
            sa.Column("uster_p25",  sa.Float,    nullable=False),
            sa.Column("uster_p50",  sa.Float,    nullable=False),
            sa.Column("uster_p75",  sa.Float,    nullable=False),
            sa.Column("uster_p95",  sa.Float,    nullable=False),
        )
        op.create_index("ix_departments_dept_id", "departments", ["dept_id"], unique=True)

    # Seed departments — override defaults with values from old settings if present
    for d in _DEPT_DEFAULTS:
        existing = conn.execute(
            sa.text("SELECT id FROM departments WHERE dept_id = :did"),
            {"did": d["dept_id"]},
        ).fetchone()
        if existing:
            continue

        target    = d["target"]
        tolerance = d["tolerance"]
        if has_old_dept_settings:
            row = conn.execute(
                sa.text("SELECT target, tolerance, def_len FROM department_settings WHERE dept_id = :did"),
                {"did": d["dept_id"]},
            ).fetchone()
            if row:
                target, tolerance = row[0], row[1]

        conn.execute(
            sa.text("""
                INSERT INTO departments
                  (dept_id, name, short, unit, def_len, frequency,
                   target, tolerance,
                   uster_p5, uster_p25, uster_p50, uster_p75, uster_p95)
                VALUES
                  (:dept_id, :name, :short, :unit, :def_len, :frequency,
                   :target, :tolerance,
                   :p5, :p25, :p50, :p75, :p95)
            """),
            {
                "dept_id": d["dept_id"], "name": d["name"], "short": d["short"],
                "unit": d["unit"],       "def_len": d["def_len"],
                "frequency": d["frequency"],
                "target": target,        "tolerance": tolerance,
                "p5": d["uster_p5"],     "p25": d["uster_p25"],
                "p50": d["uster_p50"],   "p75": d["uster_p75"],
                "p95": d["uster_p95"],
            },
        )

    # ── 2. Create settings_versions table ─────────────────────────────────────
    if "settings_versions" not in existing_tables:
        op.create_table(
            "settings_versions",
            sa.Column("id",         sa.Integer,  primary_key=True),
            sa.Column("dept_id",    sa.String,   sa.ForeignKey("departments.dept_id", ondelete="CASCADE"),
                      nullable=False),
            sa.Column("target",     sa.Float,    nullable=False),
            sa.Column("tolerance",  sa.Float,    nullable=False),
            sa.Column("usl",        sa.Float,    nullable=False),
            sa.Column("lsl",        sa.Float,    nullable=False),
            sa.Column("created_at", sa.DateTime, nullable=False),
            sa.UniqueConstraint("dept_id", "target", "tolerance", name="uq_version_values"),
        )
        op.create_index("ix_sv_dept_id", "settings_versions", ["dept_id"])

    def _get_or_create_version(dept_id: str, target: float, tolerance: float) -> int:
        usl = round(target + tolerance, 6)
        lsl = round(target - tolerance, 6)
        row = conn.execute(
            sa.text("SELECT id FROM settings_versions WHERE dept_id=:d AND target=:t AND tolerance=:tol"),
            {"d": dept_id, "t": target, "tol": tolerance},
        ).fetchone()
        if row:
            return row[0]
        result = conn.execute(
            sa.text("""
                INSERT INTO settings_versions (dept_id, target, tolerance, usl, lsl, created_at)
                VALUES (:d, :t, :tol, :usl, :lsl, :ts)
            """),
            {"d": dept_id, "t": target, "tol": tolerance,
             "usl": usl, "lsl": lsl,
             "ts": datetime.now(timezone.utc)},
        )
        return result.lastrowid

    # Seed one default version per dept (if none exist)
    for d in _DEPT_DEFAULTS:
        dept_row = conn.execute(
            sa.text("SELECT target, tolerance FROM departments WHERE dept_id = :did"),
            {"did": d["dept_id"]},
        ).fetchone()
        if dept_row:
            _get_or_create_version(d["dept_id"], dept_row[0], dept_row[1])

    # ── 3. Create or migrate samples table ────────────────────────────────────
    if "samples" not in existing_tables:
        # Fresh install — create new schema directly
        op.create_table(
            "samples",
            sa.Column("id",                  sa.Integer,  primary_key=True),
            sa.Column("dept_id",             sa.String,   sa.ForeignKey("departments.dept_id"),
                      nullable=False),
            sa.Column("settings_version_id", sa.Integer,  sa.ForeignKey("settings_versions.id"),
                      nullable=False),
            sa.Column("shift",               sa.String,   nullable=False),
            sa.Column("timestamp",           sa.DateTime, nullable=False),
            sa.Column("readings_json",       sa.Text,     nullable=False),
            sa.Column("avg_weight",          sa.Float,    nullable=True),
            sa.Column("sample_length",       sa.Float,    nullable=False),
            sa.Column("unit",                sa.String,   nullable=False),
            sa.Column("mean_hank",           sa.Float,    nullable=False),
            sa.Column("readings_count",      sa.Integer,  nullable=False),
            sa.Column("cv_pct",              sa.Float,    nullable=True),
        )
        op.create_index("ix_samples_dept_ts",    "samples", ["dept_id", "timestamp"])
        op.create_index("ix_samples_dept_shift", "samples", ["dept_id", "shift"])
        op.create_index("ix_samples_mean_hank",  "samples", ["mean_hank"])

    elif old_samples_has_snapshots:
        # ── Migrate v1 samples table ─────────────────────────────────────────
        # 1. Collect all existing rows
        old_rows = conn.execute(sa.text(
            "SELECT id, dept_id, shift, timestamp, readings_json, avg_weight, "
            "mean_hank, sample_length, unit, target_value, usl_value, lsl_value "
            "FROM samples ORDER BY timestamp ASC"
        )).fetchall()

        # 2. Rename old table
        op.rename_table("samples", "samples_v1")

        # 3. Create new samples table
        op.create_table(
            "samples",
            sa.Column("id",                  sa.Integer,  primary_key=True),
            sa.Column("dept_id",             sa.String,   sa.ForeignKey("departments.dept_id"),
                      nullable=False),
            sa.Column("settings_version_id", sa.Integer,  sa.ForeignKey("settings_versions.id"),
                      nullable=False),
            sa.Column("shift",               sa.String,   nullable=False),
            sa.Column("timestamp",           sa.DateTime, nullable=False),
            sa.Column("readings_json",       sa.Text,     nullable=False),
            sa.Column("avg_weight",          sa.Float,    nullable=True),
            sa.Column("sample_length",       sa.Float,    nullable=False),
            sa.Column("unit",                sa.String,   nullable=False),
            sa.Column("mean_hank",           sa.Float,    nullable=False),
            sa.Column("readings_count",      sa.Integer,  nullable=False),
            sa.Column("cv_pct",              sa.Float,    nullable=True),
        )
        op.create_index("ix_samples_dept_ts",    "samples", ["dept_id", "timestamp"])
        op.create_index("ix_samples_dept_shift", "samples", ["dept_id", "shift"])
        op.create_index("ix_samples_mean_hank",  "samples", ["mean_hank"])

        # 4. Migrate rows
        for row in old_rows:
            (sid, dept_id, shift, timestamp, readings_json,
             avg_weight, mean_hank, sample_length, unit,
             target_value, usl_value, lsl_value) = row

            # Derive tolerance from snapshot USL/LSL
            tolerance = round(usl_value - target_value, 6)
            ver_id = _get_or_create_version(dept_id, target_value, tolerance)

            readings = json.loads(readings_json) if readings_json else []
            cv_pct   = _welford_cv(readings)
            r_count  = len(readings)

            conn.execute(sa.text("""
                INSERT INTO samples
                  (id, dept_id, settings_version_id, shift, timestamp, readings_json,
                   avg_weight, sample_length, unit, mean_hank, readings_count, cv_pct)
                VALUES
                  (:id, :dept_id, :sv_id, :shift, :ts, :rj,
                   :aw, :sl, :unit, :mh, :rc, :cv)
            """), {
                "id": sid, "dept_id": dept_id, "sv_id": ver_id,
                "shift": shift, "ts": timestamp, "rj": readings_json,
                "aw": avg_weight, "sl": sample_length, "unit": unit,
                "mh": mean_hank, "rc": r_count, "cv": cv_pct,
            })

        # 5. Drop the old backup table
        op.drop_table("samples_v1")

    # ── 4. Drop superseded tables ─────────────────────────────────────────────
    if has_old_dept_settings:
        op.drop_table("department_settings")


def downgrade() -> None:
    """
    Downgrade recreates the v1 flat schema.
    Data in settings_versions is not recoverable via downgrade —
    snapshot targets will be re-derived from current department settings.
    """
    conn = op.get_bind()

    # Recreate old department_settings
    op.create_table(
        "department_settings",
        sa.Column("id",        sa.Integer, primary_key=True),
        sa.Column("dept_id",   sa.String,  nullable=False, unique=True),
        sa.Column("target",    sa.Float,   nullable=False),
        sa.Column("tolerance", sa.Float,   nullable=False),
        sa.Column("def_len",   sa.Float,   nullable=False),
    )
    conn.execute(sa.text("""
        INSERT INTO department_settings (dept_id, target, tolerance, def_len)
        SELECT dept_id, target, tolerance, def_len FROM departments
    """))

    # Rebuild flat samples table
    op.rename_table("samples", "samples_v2")
    op.create_table(
        "samples",
        sa.Column("id",            sa.Integer,  primary_key=True),
        sa.Column("dept_id",       sa.String,   nullable=False),
        sa.Column("shift",         sa.String,   nullable=False),
        sa.Column("timestamp",     sa.DateTime),
        sa.Column("readings_json", sa.Text,     nullable=False),
        sa.Column("avg_weight",    sa.Float,    nullable=True),
        sa.Column("mean_hank",     sa.Float,    nullable=False),
        sa.Column("sample_length", sa.Float,    nullable=False),
        sa.Column("unit",          sa.String,   nullable=False),
        sa.Column("target_value",  sa.Float,    nullable=False),
        sa.Column("usl_value",     sa.Float,    nullable=False),
        sa.Column("lsl_value",     sa.Float,    nullable=False),
    )
    conn.execute(sa.text("""
        INSERT INTO samples
          (id, dept_id, shift, timestamp, readings_json, avg_weight,
           mean_hank, sample_length, unit, target_value, usl_value, lsl_value)
        SELECT
          s.id, s.dept_id, s.shift, s.timestamp, s.readings_json, s.avg_weight,
          s.mean_hank, s.sample_length, s.unit,
          sv.target, sv.usl, sv.lsl
        FROM samples_v2 s
        JOIN settings_versions sv ON sv.id = s.settings_version_id
    """))
    op.drop_table("samples_v2")
    op.drop_table("settings_versions")
    op.drop_table("departments")

"""
models.py — Normalized SQLAlchemy ORM schema
=============================================

Design rationale for historical target accuracy
("Moving Goalposts" problem):
────────────────────────────────────────────────
Rather than copying three floats (target, USL, LSL) into every Sample row,
we maintain an append-only `settings_versions` table.  Each entry is an
immutable record of what the department's targets were at a point in time.

Flow:
  1. Department is created/seeded  → first SettingsVersion created
  2. PUT /settings/{dept_id}        → new SettingsVersion row written
  3. POST /samples                  → Sample.settings_version_id = current version id

Consequence: changing a target today creates a new version; every historical
Sample still points at the version that was in effect when it was recorded.
Cpk, quality-status, and USL/LSL in the Data Log always reflect the rules
that governed that batch — never the current rules.

Performance notes:
──────────────────
  • Sample.mean_hank   is stored (computed at save time) so the overview
    endpoint can build batch-mean arrays with a single lightweight column
    query, avoiding JSON deserialization of all readings.
  • Sample.readings_count is stored so subgroup-size lookups don't need
    to parse readings_json.
  • Sample.cv_pct is stored so the Data Log can render without parsing JSON.
  • readings_json is only fetched for single-sample detail or CSV export.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, Float, Text, DateTime, Boolean,
    ForeignKey, Index, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from database import Base


# ── 1. Department master ────────────────────────────────────────────────────
class Department(Base):
    """
    Canonical department definition.  Stores both structural metadata (name,
    unit, Uster percentiles) and the *current* target/tolerance (mutable).

    Replaces the old hardcoded DEPTS list in logic.py and the old
    DepartmentSettings table.
    """
    __tablename__ = "departments"

    id          = Column(Integer, primary_key=True)
    dept_id     = Column(String,  unique=True, index=True, nullable=False)
    name        = Column(String,  nullable=False)
    short       = Column(String,  nullable=False)
    unit        = Column(String,  nullable=False)   # 'Ne' | 'hank'
    def_len     = Column(Float,   nullable=False)   # yards
    frequency   = Column(String,  nullable=False)

    # Current (mutable) targets — updated by PUT /api/settings/{dept_id}
    target      = Column(Float,   nullable=False)
    tolerance   = Column(Float,   nullable=False)

    # Uster Statistics 2023 — Ne 47 weft percentiles
    uster_p5    = Column(Float,   nullable=False)
    uster_p25   = Column(Float,   nullable=False)
    uster_p50   = Column(Float,   nullable=False)
    uster_p75   = Column(Float,   nullable=False)
    uster_p95   = Column(Float,   nullable=False)

    # Relationships
    settings_versions = relationship(
        "SettingsVersion", back_populates="department",
        order_by="SettingsVersion.created_at",
    )
    samples = relationship("Sample", back_populates="department")

    # ── Helpers ─────────────────────────────────────────────────────────────
    @property
    def usl(self) -> float:
        return round(self.target + self.tolerance, 6)

    @property
    def lsl(self) -> float:
        return round(self.target - self.tolerance, 6)

    @property
    def uster(self) -> dict:
        return {
            "p5":  self.uster_p5,
            "p25": self.uster_p25,
            "p50": self.uster_p50,
            "p75": self.uster_p75,
            "p95": self.uster_p95,
        }

    def to_dict(self) -> dict:
        """Return logic-compatible dict (mirrors the old DEPTS format)."""
        return {
            "id":        self.dept_id,
            "name":      self.name,
            "short":     self.short,
            "unit":      self.unit,
            "def_len":   self.def_len,
            "frequency": self.frequency,
            "target":    self.target,
            "tol":       self.tolerance,
            "us":        self.uster,
        }


# ── 2. Settings version (immutable snapshot) ────────────────────────────────
class SettingsVersion(Base):
    """
    Append-only record of department targets at a specific point in time.

    A new row is written whenever the department's target or tolerance is
    changed.  Samples reference a specific version via FK so that historical
    evaluation always uses the rules that were active at collection time.
    """
    __tablename__ = "settings_versions"

    id         = Column(Integer,  primary_key=True)
    dept_id    = Column(String,   ForeignKey("departments.dept_id", ondelete="CASCADE"),
                        index=True, nullable=False)
    target     = Column(Float,    nullable=False)
    tolerance  = Column(Float,    nullable=False)
    usl        = Column(Float,    nullable=False)
    lsl        = Column(Float,    nullable=False)
    created_at = Column(DateTime, nullable=False,
                        default=lambda: datetime.now(timezone.utc))

    department = relationship("Department", back_populates="settings_versions")
    samples    = relationship("Sample",     back_populates="settings_version")

    # Unique index: one row per distinct (dept, target, tolerance) tuple.
    # Prevents duplicate version rows when settings are saved to the same values.
    __table_args__ = (
        UniqueConstraint("dept_id", "target", "tolerance", name="uq_version_values"),
    )


# ── 3. Sample batch ──────────────────────────────────────────────────────────
class Sample(Base):
    """
    One saved batch of hank/Ne readings.

    Performance-critical columns (no JSON parsing required for overviews):
      • mean_hank      — pre-computed batch mean
      • readings_count — number of readings (avoids JSON parse for subgroup size)
      • cv_pct         — pre-computed batch CV% (avoids JSON parse for log view)

    The full readings_json blob is only fetched for:
      • Single-sample detail views
      • CSV export
      • Chart rendering (individual point data)
    """
    __tablename__ = "samples"

    id                  = Column(Integer,  primary_key=True, index=True)
    dept_id             = Column(String,   ForeignKey("departments.dept_id"),
                                 index=True, nullable=False)
    settings_version_id = Column(Integer,  ForeignKey("settings_versions.id"),
                                 nullable=False)
    shift               = Column(String,   nullable=False)               # 'A' | 'B' | 'C'
    timestamp           = Column(DateTime, nullable=False,
                                 default=lambda: datetime.now(timezone.utc),
                                 index=True)

    # Measurement data
    readings_json  = Column(Text,  nullable=False)   # JSON list[float]
    avg_weight     = Column(Float, nullable=True)    # grams (weight-mode only)
    sample_length  = Column(Float, nullable=False)   # yards
    unit           = Column(String, nullable=False)  # 'Ne' | 'hank'

    # ── Denormalized for fast queries (computed once at save time) ───────────
    mean_hank      = Column(Float,   nullable=False, index=True)
    readings_count = Column(Integer, nullable=False)   # len(readings)
    cv_pct         = Column(Float,   nullable=True)    # batch CV%
    frame_number     = Column(Integer, nullable=True)    # 1–25, ring frame only
    simplex_lane     = Column(String, nullable=True)   # 'front' | 'back'  (Simplex only)
    measurement_type = Column(String, nullable=True)   # 'full_bubble' | 'half_bubble' (Simplex only)

    # Relationships
    department       = relationship("Department",     back_populates="samples")
    settings_version = relationship("SettingsVersion", back_populates="samples")

    # ── Composite indexes for common query patterns ──────────────────────────
    __table_args__ = (
        Index("ix_samples_dept_ts",    "dept_id",  "timestamp"),
        Index("ix_samples_dept_shift", "dept_id",  "shift"),
    )


# ── 4. YarnLAB — Trial Run ──────────────────────────────────────────────────
class LabTrial(Base):
    """
    A named quality sandbox trial for validating machine readiness for a new
    yarn count.  Isolated from regular production data.
    """
    __tablename__ = "lab_trials"

    id          = Column(Integer, primary_key=True)
    name        = Column(String,  nullable=False)
    description = Column(String,  nullable=True)
    status      = Column(String,  nullable=False, default="active")  # 'active' | 'complete'
    created_at  = Column(DateTime, nullable=False,
                         default=lambda: datetime.now(timezone.utc))

    benchmarks = relationship("LabBenchmark", back_populates="trial",
                              cascade="all, delete-orphan")
    samples    = relationship("LabSample",    back_populates="trial",
                              cascade="all, delete-orphan")
    rsb_cans   = relationship("LabRSBCan",       back_populates="trial",
                              cascade="all, delete-orphan", order_by="LabRSBCan.slot")
    simplex_bobbins = relationship("LabSimplexBobbin", back_populates="trial",
                                   cascade="all, delete-orphan", order_by="LabSimplexBobbin.order_index")
    ringframe_cops  = relationship("LabRingframeCop",  back_populates="trial",
                                   cascade="all, delete-orphan", order_by="LabRingframeCop.id")


# ── 5. YarnLAB — Gold Standard Benchmark ───────────────────────────────────
class LabBenchmark(Base):
    """
    Per-department gold standard target/tolerance for a specific trial.
    One row per (trial, dept) pair.  Upserted when the user edits benchmarks.
    """
    __tablename__ = "lab_benchmarks"

    id        = Column(Integer, primary_key=True)
    trial_id  = Column(Integer, ForeignKey("lab_trials.id", ondelete="CASCADE"),
                       nullable=False, index=True)
    dept_id   = Column(String,  nullable=False)
    target    = Column(Float,   nullable=False)
    tolerance = Column(Float,   nullable=False)

    trial = relationship("LabTrial", back_populates="benchmarks")

    __table_args__ = (
        UniqueConstraint("trial_id", "dept_id", name="uq_lab_bench"),
    )


# ── 6. YarnLAB — Trial Sample ────────────────────────────────────────────────
class LabSample(Base):
    """
    A single batch of readings logged against a lab trial (not production).
    Denormalised fast columns mirror the production Sample model.
    """
    __tablename__ = "lab_samples"

    id             = Column(Integer, primary_key=True)
    trial_id       = Column(Integer, ForeignKey("lab_trials.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    dept_id        = Column(String,  nullable=False, index=True)
    readings_json  = Column(Text,    nullable=False)
    mean_hank      = Column(Float,   nullable=False)
    cv_pct         = Column(Float,   nullable=True)
    readings_count = Column(Integer, nullable=False)
    avg_weight     = Column(Float,   nullable=True)
    sample_length  = Column(Float,   nullable=False)
    frame_number   = Column(Integer, nullable=True)
    notes          = Column(String,  nullable=True)
    timestamp      = Column(DateTime, nullable=False,
                            default=lambda: datetime.now(timezone.utc),
                            index=True)

    trial = relationship("LabTrial", back_populates="samples")


# ── 7. YarnLAB — Flow tracking entities ───────────────────────────────────────
class LabRSBCan(Base):
    __tablename__ = "lab_rsb_cans"

    id          = Column(Integer, primary_key=True)
    trial_id    = Column(Integer, ForeignKey("lab_trials.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    slot        = Column(Integer, nullable=False)  # 1..5
    hank_value  = Column(Float,   nullable=True)
    notes       = Column(String,  nullable=True)
    is_perfect  = Column(Boolean, nullable=False, default=False)
    sample_length  = Column(Float,   nullable=False, default=6.0)
    readings_json  = Column(Text,    nullable=True)
    readings_count = Column(Integer, nullable=False, default=0)
    mean_hank      = Column(Float,   nullable=True)
    cv_pct         = Column(Float,   nullable=True)
    created_at  = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at  = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc),
                         onupdate=lambda: datetime.now(timezone.utc))

    trial = relationship("LabTrial", back_populates="rsb_cans")
    simplex_links = relationship("LabSimplexInput", back_populates="rsb_can",
                                 cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("trial_id", "slot", name="uq_rsb_trial_slot"),
    )


class LabSimplexBobbin(Base):
    __tablename__ = "lab_simplex_bobbins"

    id                 = Column(Integer, primary_key=True)
    trial_id           = Column(Integer, ForeignKey("lab_trials.id", ondelete="CASCADE"),
                                nullable=False, index=True)
    label              = Column(String,  nullable=False)
    hank_value         = Column(Float,   nullable=True)
    notes              = Column(String,  nullable=True)
    verified_same_hank = Column(Boolean, nullable=False, default=False)
    doff_minutes       = Column(Integer, nullable=False, default=180)
    order_index        = Column(Integer, nullable=False, default=0)
    sample_length      = Column(Float,   nullable=False, default=6.0)
    readings_json      = Column(Text,    nullable=True)
    readings_count     = Column(Integer, nullable=False, default=0)
    mean_hank          = Column(Float,   nullable=True)
    cv_pct             = Column(Float,   nullable=True)
    created_at         = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    trial   = relationship("LabTrial", back_populates="simplex_bobbins")
    inputs  = relationship("LabSimplexInput", back_populates="bobbin",
                           cascade="all, delete-orphan")
    outputs = relationship("LabRingframeInput", back_populates="simplex_bobbin")


class LabSimplexInput(Base):
    __tablename__ = "lab_simplex_inputs"

    id         = Column(Integer, primary_key=True)
    bobbin_id  = Column(Integer, ForeignKey("lab_simplex_bobbins.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    rsb_can_id = Column(Integer, ForeignKey("lab_rsb_cans.id", ondelete="CASCADE"),
                        nullable=False, index=True)

    bobbin  = relationship("LabSimplexBobbin", back_populates="inputs")
    rsb_can = relationship("LabRSBCan",        back_populates="simplex_links")

    __table_args__ = (
        UniqueConstraint("bobbin_id", "rsb_can_id", name="uq_simplex_input"),
    )


class LabRingframeCop(Base):
    __tablename__ = "lab_ringframe_cops"

    id         = Column(Integer, primary_key=True)
    trial_id   = Column(Integer, ForeignKey("lab_trials.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    label      = Column(String,  nullable=False)
    hank_value = Column(Float,   nullable=True)
    notes      = Column(String,  nullable=True)
    readings_json  = Column(Text,    nullable=True)
    readings_count = Column(Integer, nullable=False, default=0)
    mean_hank      = Column(Float,   nullable=True)
    cv_pct         = Column(Float,   nullable=True)
    sample_length = Column(Float,   nullable=False, default=120.0)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    trial  = relationship("LabTrial", back_populates="ringframe_cops")
    inputs = relationship("LabRingframeInput", back_populates="cop",
                          cascade="all, delete-orphan")


class LabRingframeInput(Base):
    __tablename__ = "lab_ringframe_inputs"

    id                = Column(Integer, primary_key=True)
    cop_id            = Column(Integer, ForeignKey("lab_ringframe_cops.id", ondelete="CASCADE"),
                               nullable=False, index=True)
    simplex_bobbin_id = Column(Integer, ForeignKey("lab_simplex_bobbins.id", ondelete="CASCADE"),
                               nullable=False, index=True)

    cop            = relationship("LabRingframeCop",    back_populates="inputs")
    simplex_bobbin = relationship("LabSimplexBobbin",  back_populates="outputs")

    __table_args__ = (
        UniqueConstraint("cop_id", "simplex_bobbin_id", name="uq_ringframe_input"),
    )

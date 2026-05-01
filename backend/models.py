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
    Column, Date, Integer, String, Float, Text, DateTime, Boolean,
    ForeignKey, Index, UniqueConstraint, PrimaryKeyConstraint,
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
    slot        = Column(Integer, nullable=False)  # 1..10
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
    machine_number     = Column(Integer, nullable=True)   # 1–3 (Simplex machine that produced this bobbin)
    spindle_number     = Column(Integer, nullable=True)   # spindle within that machine
    readings_json      = Column(Text,    nullable=True)
    readings_count     = Column(Integer, nullable=False, default=0)
    mean_hank          = Column(Float,   nullable=True)
    cv_pct             = Column(Float,   nullable=True)
    created_at         = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    trial   = relationship("LabTrial", back_populates="simplex_bobbins")
    inputs  = relationship("LabSimplexInput", back_populates="bobbin",
                           cascade="all, delete-orphan")
    outputs = relationship("LabRingframeInput", back_populates="simplex_bobbin", cascade="all, delete-orphan")


class LabSimplexInput(Base):
    __tablename__ = "lab_simplex_inputs"

    id         = Column(Integer, primary_key=True)
    bobbin_id  = Column(Integer, ForeignKey("lab_simplex_bobbins.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    rsb_can_id = Column(Integer, ForeignKey("lab_rsb_cans.id", ondelete="CASCADE"),
                        nullable=False, index=True)

    # Per-link readings: each (can → bobbin) link stores its own measurement
    # independently, so the same can measured on bobbin A vs bobbin B is tracked
    # as separate instances (mirrors the cop-per-frame independence model).
    sample_length  = Column(Float,   nullable=True, default=6.0)
    readings_json  = Column(Text,    nullable=True)
    readings_count = Column(Integer, nullable=True, default=0)
    mean_hank      = Column(Float,   nullable=True)
    cv_pct         = Column(Float,   nullable=True)

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
    frame_number   = Column(Integer, nullable=True)
    spindle_number = Column(Integer, nullable=True)   # spindle within the ring frame
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


# ── 12. Production Module — Standard Rates ──────────────────────────────────
class ProductionStdRate(Base):
    """
    Editable standard production rate (kg/hr) per department (or per machine).
    Used exclusively by the efficiency-based calculation method (Carding, Breaker, RSB).
    machine_number = NULL means dept-wide default.
    """
    __tablename__ = "production_std_rates"

    id                = Column(Integer, primary_key=True)
    dept_id           = Column(String(50), nullable=False, index=True)
    machine_number    = Column(Integer,    nullable=True)    # NULL = dept default
    std_rate_kg_per_hr = Column(Float,    nullable=False, default=0.0)
    label             = Column(String(80), nullable=True)
    updated_at        = Column(DateTime,   nullable=True)


# ── 13. Production Module — Shift Entries ───────────────────────────────────
class ProductionEntry(Base):
    """
    One production entry per (dept, machine, shift, date).

    Two calculation methods:
      'efficiency'  — Carding, Breaker, RSB
          primary_kg = std_rate × (efficiency_pct / 100) × running_hours

      'hank_meter'  — Simplex, Ring Frame
          primary_kg = (hank_reading × spindle_count / ne_count) × 0.453592
          (1 hank = 840 yards; Ne = yards per pound / 840)

    Optional secondary theoretical (hank_meter depts only):
          delivery_speed_ypm = spindle_rpm / (tpi × 36)
          theoretical_kg = delivery_speed_ypm × 480 × spindle_count / (ne_count × 840) × 0.453592
          (480 = shift minutes; override if needed)
    """
    __tablename__ = "production_entries"

    id             = Column(Integer,    primary_key=True)
    dept_id        = Column(String(50), nullable=False, index=True)
    shift          = Column(String(1),  nullable=False)       # 'A' | 'B' | 'C'
    entry_date     = Column(Date,       nullable=False, index=True)
    machine_number = Column(Integer,    nullable=True)
    calc_method    = Column(String(20), nullable=False)       # 'efficiency' | 'hank_meter'

    # Efficiency method
    efficiency_pct     = Column(Float, nullable=True)
    running_hours      = Column(Float, nullable=True)
    std_rate_kg_per_hr = Column(Float, nullable=True)         # snapshot at save time

    # Hank meter method
    hank_reading  = Column(Float,   nullable=True)            # hanks / spindle (shift total)
    spindle_count = Column(Integer, nullable=True)            # working spindles
    ne_count      = Column(Float,   nullable=True)            # yarn count

    # Optional secondary inputs
    spindle_rpm = Column(Float, nullable=True)
    tpi         = Column(Float, nullable=True)                # turns per inch

    # Computed results
    primary_kg     = Column(Float, nullable=False)
    theoretical_kg = Column(Float, nullable=True)

    notes      = Column(Text,     nullable=True)
    recorded_at = Column(DateTime, nullable=False)
    created_at  = Column(DateTime, nullable=False,
                         default=lambda: datetime.now(timezone.utc))
    is_void    = Column(Boolean,  nullable=False, default=False)
    voided_at  = Column(DateTime, nullable=True)
    void_reason = Column(Text,    nullable=True)

    __table_args__ = (
        Index("ix_prod_entries_dept_date", "dept_id", "entry_date"),
        Index("ix_prod_entries_date_shift", "entry_date", "shift"),
    )


# ── 14. Material / Inventory / MRP / Purchase Engine ────────────────────────

class BusinessPartner(Base):
    """
    Unified Business Partner — SAP-style single entity used across all modules.

    Roles (stored in bp_roles):
      MM_VENDOR   — supplier used in Procurement / GR
      FI_VENDOR   — accounts-payable party (FI module, future)
      FI_CUSTOMER — accounts-receivable party (FI module, future)
      SD_CUSTOMER — sales customer (SD module, future)

    A single BP can carry multiple roles.
    """
    __tablename__ = "business_partners"

    id              = Column(Integer, primary_key=True)
    bp_code         = Column(String(40),  nullable=False, unique=True, index=True)
    name            = Column(String(120), nullable=False)             # Name 1
    name_2          = Column(String(120), nullable=True)              # Name 2 (optional)
    grouping        = Column(String(40),  nullable=True)              # BP grouping / account group
    bp_category     = Column(String(20),  nullable=True,              # Organization | Individual
                             default="Organization")
    status          = Column(String(20),  nullable=False, default="Active")  # Active|Blocked
    # Structured address (SAP-standard fields)
    street          = Column(String(120), nullable=True)
    house_number    = Column(String(20),  nullable=True)
    city            = Column(String(80),  nullable=True)
    postal_code     = Column(String(20),  nullable=True)
    country         = Column(String(80),  nullable=True, default="India")
    region          = Column(String(80),  nullable=True)              # State / Province
    language        = Column(String(20),  nullable=True, default="EN")
    address         = Column(Text,        nullable=True)              # LEGACY free-text; keep for compat
    phone           = Column(String(40),  nullable=True)
    email           = Column(String(120), nullable=True)
    contact_person  = Column(String(120), nullable=True)
    gst_number      = Column(String(40),  nullable=True)
    pan             = Column(String(20),  nullable=True)
    created_at      = Column(DateTime,    nullable=False,
                             default=lambda: datetime.now(timezone.utc))
    updated_at      = Column(DateTime,    nullable=True)

    roles           = relationship("BPRole",        back_populates="business_partner",
                                   cascade="all, delete-orphan")
    goods_receipts  = relationship("GoodsReceipt",  back_populates="business_partner")
    purchase_orders = relationship("PurchaseOrder",  back_populates="business_partner")
    bp_materials    = relationship("BPMaterial",     back_populates="business_partner",
                                   cascade="all, delete-orphan")


class BPRole(Base):
    """Many roles per Business Partner, stored as explicit rows (not flags)."""
    __tablename__ = "bp_roles"

    id                  = Column(Integer, primary_key=True)
    business_partner_id = Column(Integer, ForeignKey("business_partners.id",
                                  ondelete="CASCADE"), nullable=False, index=True)
    role                = Column(String(30), nullable=False)
    created_at          = Column(DateTime, nullable=False,
                                 default=lambda: datetime.now(timezone.utc))

    business_partner = relationship("BusinessPartner", back_populates="roles")

    __table_args__ = (
        UniqueConstraint("business_partner_id", "role", name="uq_bp_role"),
    )


class BPMaterial(Base):
    """
    Business Partner – Material procurement link.
    Tracks which BP (MM_VENDOR) supplies which material.
    Auto-updated on GR posting: last_price, last_price_date.
    Replaces the legacy VendorMaterial table for all active business logic.
    """
    __tablename__ = "bp_materials"

    id                  = Column(Integer, primary_key=True)
    business_partner_id = Column(Integer, ForeignKey("business_partners.id",
                                  ondelete="CASCADE"), nullable=False, index=True)
    material_id         = Column(Integer, ForeignKey("materials.id",
                                  ondelete="CASCADE"), nullable=False, index=True)
    is_preferred        = Column(Boolean, nullable=False, default=False)
    lead_time_days      = Column(Float,   nullable=True)
    last_price          = Column(Float,   nullable=True)
    last_price_date     = Column(Date,    nullable=True)
    notes               = Column(Text,    nullable=True)
    created_at          = Column(DateTime, nullable=False,
                                 default=lambda: datetime.now(timezone.utc))

    business_partner = relationship("BusinessPartner", back_populates="bp_materials")
    material         = relationship("Material",         back_populates="bp_materials")

    __table_args__ = (
        UniqueConstraint("business_partner_id", "material_id", name="uq_bp_material"),
    )


class Vendor(Base):
    """
    LEGACY — Vendor master. No longer used in business logic.
    Table kept in DB for historical reference only. Use BusinessPartner instead.
    """
    __tablename__ = "vendors"

    id              = Column(Integer, primary_key=True)
    code            = Column(String(40),  nullable=False, unique=True, index=True)
    name            = Column(String(120), nullable=False)
    contact_person  = Column(String(120), nullable=True)
    phone           = Column(String(40),  nullable=True)
    email           = Column(String(120), nullable=True)
    gst_number      = Column(String(40),  nullable=True)
    address         = Column(Text,        nullable=True)
    status          = Column(String(20),  nullable=False, default="active")
    created_at      = Column(DateTime,    nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at      = Column(DateTime,    nullable=True)
    # No active ORM relationships — all business logic now uses BusinessPartner.


class VendorMaterial(Base):
    """
    LEGACY — Vendor–Material join table.
    No longer used in business logic. Replaced by BPMaterial.
    Table kept in DB for historical reference only.
    """
    __tablename__ = "vendor_materials"

    id              = Column(Integer, primary_key=True)
    vendor_id       = Column(Integer, ForeignKey("vendors.id",   ondelete="CASCADE"),
                             nullable=False, index=True)
    material_id     = Column(Integer, ForeignKey("materials.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    is_preferred    = Column(Boolean, nullable=False, default=False)
    lead_time_days  = Column(Float,   nullable=True)
    last_price      = Column(Float,   nullable=True)
    last_price_date = Column(Date,    nullable=True)
    notes           = Column(Text,    nullable=True)
    created_at      = Column(DateTime, nullable=False,
                             default=lambda: datetime.now(timezone.utc))
    # No active ORM relationships — use BPMaterial instead.

    __table_args__ = (
        UniqueConstraint("vendor_id", "material_id", name="uq_vendor_material"),
    )


class Material(Base):
    """Raw material master. Stock is never edited here; inventory ledger drives balances."""
    __tablename__ = "materials"

    id            = Column(Integer, primary_key=True)
    code          = Column(String(40), nullable=False, unique=True, index=True)
    name          = Column(String(120), nullable=False)
    base_unit     = Column(String(20), nullable=False)
    material_type = Column(String(40), nullable=True)   # RAW_MATERIAL|MAINTENANCE|CONSUMABLE
    category      = Column(String(60), nullable=True)   # type-specific sub-category
    description   = Column(Text,       nullable=True)
    is_active     = Column(Boolean, nullable=False, default=True)
    created_at  = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at  = Column(DateTime, nullable=True)

    planning_params  = relationship("MaterialPlanningParam", back_populates="material", uselist=False)
    stock_lots       = relationship("InventoryStock",         back_populates="material")
    bp_materials     = relationship("BPMaterial",             back_populates="material",
                                    cascade="all, delete-orphan")


class ProductionMaterialConsumption(Base):
    """Legacy table from the first MRP iteration. New consumption uses material issue documents."""
    __tablename__ = "production_material_consumptions"

    id                  = Column(Integer, primary_key=True)
    production_entry_id = Column(Integer, ForeignKey("production_entries.id"), nullable=False, index=True)
    material_id         = Column(Integer, ForeignKey("materials.id"), nullable=False, index=True)
    quantity            = Column(Float, nullable=False)
    unit                = Column(String(20), nullable=False)
    created_at          = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    production_entry = relationship("ProductionEntry")
    material = relationship("Material")
    inventory_movements = relationship("InventoryMovement", back_populates="production_consumption")

    __table_args__ = (
        UniqueConstraint("production_entry_id", "material_id", name="uq_prod_consumption_material"),
    )


class InventoryMovement(Base):
    """
    Append-only inventory ledger.
    movement_type: issue, receipt, adjustment, reversal.
    quantity_delta is signed: issues negative, receipts positive.
    """
    __tablename__ = "inventory_movements"

    id                  = Column(Integer, primary_key=True)
    material_id         = Column(Integer, ForeignKey("materials.id"), nullable=False, index=True)
    movement_type       = Column(String(30), nullable=False)
    source_type         = Column(String(40), nullable=False)
    source_id           = Column(Integer, nullable=True, index=True)
    production_consumption_id = Column(Integer, ForeignKey("production_material_consumptions.id"), nullable=True)
    material_issue_line_id = Column(Integer, ForeignKey("material_issue_lines.id"), nullable=True)
    goods_receipt_line_id = Column(Integer, ForeignKey("goods_receipt_lines.id"), nullable=True)
    quantity_delta      = Column(Float, nullable=False)
    unit                = Column(String(20), nullable=False)
    lot_id              = Column(String(80), nullable=True)
    movement_date       = Column(Date, nullable=False, index=True)
    notes               = Column(Text, nullable=True)
    created_by          = Column(String(80), nullable=True)
    created_at          = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), index=True)

    material = relationship("Material")
    production_consumption = relationship("ProductionMaterialConsumption", back_populates="inventory_movements")
    material_issue_line = relationship("MaterialIssueLine", back_populates="inventory_movements")
    goods_receipt_line = relationship("GoodsReceiptLine", back_populates="inventory_movements")

    __table_args__ = (
        Index("ix_inventory_movements_material_date", "material_id", "movement_date"),
    )


class InventoryStock(Base):
    """Cached current stock per (material, lot). lot_id='' means no lot."""
    __tablename__ = "inventory_stock"

    material_id      = Column(Integer, ForeignKey("materials.id"), nullable=False, index=True)
    lot_id           = Column(String(80), nullable=False, default='')
    quantity_on_hand = Column(Float, nullable=False, default=0.0)
    unit             = Column(String(20), nullable=False)
    last_movement_id = Column(Integer, ForeignKey("inventory_movements.id"), nullable=True)
    updated_at       = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    material      = relationship("Material", back_populates="stock_lots")
    last_movement = relationship("InventoryMovement")

    __table_args__ = (
        PrimaryKeyConstraint("material_id", "lot_id"),
    )


class MaterialPlanningParam(Base):
    """MRP inputs per material."""
    __tablename__ = "material_planning_params"

    id                = Column(Integer, primary_key=True)
    material_id        = Column(Integer, ForeignKey("materials.id"), nullable=False, unique=True, index=True)
    lead_time_days     = Column(Float, nullable=False, default=5.0)
    safety_stock_qty   = Column(Float, nullable=False, default=0.0)
    reorder_qty        = Column(Float, nullable=False, default=0.0)
    critical_days_left = Column(Float, nullable=False, default=2.0)
    updated_at         = Column(DateTime, nullable=True)

    material = relationship("Material", back_populates="planning_params")


class MaterialIssueDocument(Base):
    """SAP-style goods issue document — daily total basis, no shift distinction."""
    __tablename__ = "material_issue_documents"

    id              = Column(Integer, primary_key=True)
    document_number = Column(String(40), nullable=False, unique=True, index=True)
    issue_date      = Column(Date, nullable=False, index=True)
    shift           = Column(String(1), nullable=True, default="D")   # 'D' = daily
    purpose         = Column(String(40), nullable=True, default="Production")
    reference       = Column(String(120), nullable=True)
    status          = Column(String(30), nullable=False, default="posted")
    notes           = Column(Text, nullable=True)
    created_at      = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    lines = relationship("MaterialIssueLine", back_populates="document", cascade="all, delete-orphan")


class MaterialIssueLine(Base):
    __tablename__ = "material_issue_lines"

    id          = Column(Integer, primary_key=True)
    document_id = Column(Integer, ForeignKey("material_issue_documents.id"), nullable=False, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False, index=True)
    quantity      = Column(Float, nullable=False)
    unit          = Column(String(20), nullable=False)
    movement_type = Column(String(10), nullable=False, default="GI")
    lot_id        = Column(String(80), nullable=True)

    document = relationship("MaterialIssueDocument", back_populates="lines")
    material = relationship("Material")
    inventory_movements = relationship("InventoryMovement", back_populates="material_issue_line")


class PurchaseRecommendation(Base):
    """Internal PR-like recommendation generated by MRP. Not a purchase order."""
    __tablename__ = "purchase_recommendations"

    id              = Column(Integer, primary_key=True)
    material_id     = Column(Integer, ForeignKey("materials.id"), nullable=False, index=True)
    status          = Column(String(30), nullable=False, default="open")
    suggested_qty   = Column(Float, nullable=False)
    unit            = Column(String(20), nullable=False)
    reason          = Column(Text, nullable=False)
    decision_support = Column(Text, nullable=True)
    stock_at_creation = Column(Float, nullable=False)
    reorder_level   = Column(Float, nullable=False)
    avg_consumption = Column(Float, nullable=False)
    price_trend     = Column(String(20), nullable=True)
    created_at      = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    converted_at    = Column(DateTime, nullable=True)

    material = relationship("Material")


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id                  = Column(Integer, primary_key=True)
    po_number           = Column(String(40), nullable=False, unique=True, index=True)
    business_partner_id = Column(Integer, ForeignKey("business_partners.id"),
                                 nullable=True, index=True)
    vendor_id           = Column(Integer, ForeignKey("vendors.id"), nullable=True, index=True)
    # LEGACY: vendor_id kept as nullable dead column for DB compat; use business_partner_id.
    supplier            = Column(String(120), nullable=True)   # free-text fallback / display name
    status              = Column(String(30), nullable=False, default="open")
    order_date          = Column(Date, nullable=False)
    created_at          = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    business_partner = relationship("BusinessPartner", back_populates="purchase_orders")
    lines    = relationship("PurchaseOrderLine", back_populates="purchase_order", cascade="all, delete-orphan")
    receipts = relationship("GoodsReceipt", back_populates="purchase_order")


class PurchaseOrderLine(Base):
    __tablename__ = "purchase_order_lines"

    id                 = Column(Integer, primary_key=True)
    purchase_order_id  = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False, index=True)
    recommendation_id  = Column(Integer, ForeignKey("purchase_recommendations.id"), nullable=True)
    material_id        = Column(Integer, ForeignKey("materials.id"), nullable=False, index=True)
    quantity_ordered   = Column(Float, nullable=False)
    unit               = Column(String(20), nullable=False)
    rate               = Column(Float, nullable=False)
    quantity_received  = Column(Float, nullable=False, default=0.0)

    purchase_order = relationship("PurchaseOrder", back_populates="lines")
    material = relationship("Material")
    recommendation = relationship("PurchaseRecommendation")


class GoodsReceipt(Base):
    """
    Goods Receipt document.
    Can be:
      - PO-based: purchase_order_id is set, lines reference PO lines
      - Direct (vendor invoice/opening stock): vendor_id set, purchase_order_id = NULL
    Attachments (invoice PDF/image) are stored in Supabase Storage; URL saved here.
    """
    __tablename__ = "goods_receipts"

    id                   = Column(Integer, primary_key=True)
    gr_number            = Column(String(40), nullable=False, unique=True, index=True)
    purchase_order_id    = Column(Integer, ForeignKey("purchase_orders.id"), nullable=True, index=True)
    # New: Business Partner replaces vendor_id
    business_partner_id  = Column(Integer, ForeignKey("business_partners.id"), nullable=True, index=True)
    # Legacy vendor_id kept for DB integrity only
    vendor_id            = Column(Integer, ForeignKey("vendors.id"), nullable=True, index=True)
    document_date        = Column(Date, nullable=True)       # date on the supplier's invoice
    receipt_date         = Column(Date, nullable=False)      # posting date in our system
    reference            = Column(String(120), nullable=True)
    attachment_url       = Column(Text, nullable=True)
    notes                = Column(Text, nullable=True)
    created_at           = Column(DateTime, nullable=False,
                                  default=lambda: datetime.now(timezone.utc))

    purchase_order   = relationship("PurchaseOrder",    back_populates="receipts")
    business_partner = relationship("BusinessPartner",  back_populates="goods_receipts")
    lines            = relationship("GoodsReceiptLine", back_populates="goods_receipt",
                                   cascade="all, delete-orphan")
    # vendor_id column kept as nullable dead column for DB compat; no ORM relationship.


class GoodsReceiptLine(Base):
    __tablename__ = "goods_receipt_lines"

    id                     = Column(Integer, primary_key=True)
    goods_receipt_id       = Column(Integer, ForeignKey("goods_receipts.id"), nullable=False, index=True)
    purchase_order_line_id = Column(Integer, ForeignKey("purchase_order_lines.id"), nullable=True, index=True)
    material_id            = Column(Integer, ForeignKey("materials.id"), nullable=False, index=True)
    quantity_received      = Column(Float, nullable=False)
    unit                   = Column(String(20), nullable=False)
    rate                   = Column(Float, nullable=True)   # optional on direct GRs

    lot_id                 = Column(String(80), nullable=True)

    goods_receipt       = relationship("GoodsReceipt", back_populates="lines")
    purchase_order_line = relationship("PurchaseOrderLine")
    material            = relationship("Material")
    inventory_movements = relationship("InventoryMovement", back_populates="goods_receipt_line")


class MaterialMarketPrice(Base):
    __tablename__ = "material_market_prices"

    id          = Column(Integer, primary_key=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False, index=True)
    price_date  = Column(Date, nullable=False, index=True)
    price       = Column(Float, nullable=False)
    unit        = Column(String(20), nullable=False)
    created_at  = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    material = relationship("Material")

    __table_args__ = (
        UniqueConstraint("material_id", "price_date", name="uq_material_market_price_date"),
    )

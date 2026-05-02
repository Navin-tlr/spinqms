"""
schemas.py — Pydantic v2 request / response models
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, model_validator


# ── Settings ──────────────────────────────────────────────────────────────────
class SettingsUpdate(BaseModel):
    target:    float = Field(..., gt=0, description="Target hank/Ne count")
    tolerance: float = Field(..., gt=0, description="±tolerance around target")
    def_len:   float = Field(..., gt=0, description="Default sample length (yards)")


class SettingsOut(BaseModel):
    dept_id:   str
    target:    float
    tolerance: float
    def_len:   float
    usl:       float    # = target + tolerance
    lsl:       float    # = target - tolerance

    model_config = {"from_attributes": True}


# ── Sample creation ───────────────────────────────────────────────────────────
class SampleCreate(BaseModel):
    dept_id:       str
    shift:         str = Field(..., pattern="^[ABC]$")
    readings:      List[float] = Field(..., min_length=3)
    avg_weight:    Optional[float] = Field(None, gt=0)  # grams; None if direct mode
    sample_length: float = Field(..., gt=0)             # yards
    frame_number:  Optional[int] = Field(None, ge=1, le=25)
    recorded_at:   Optional[datetime] = Field(
        None,
        description="Optional historical timestamp (ISO-8601). If omitted, current UTC is used.",
    )
    simplex_lane:     Optional[str] = Field(None, description="'front' or 'back' (Simplex only)")
    measurement_type: Optional[str] = Field(None, description="'full_bubble' or 'half_bubble' (Simplex only)")

    @model_validator(mode="after")
    def readings_positive(self) -> "SampleCreate":
        if any(r <= 0 for r in self.readings):
            raise ValueError("All readings must be positive")
        return self


# ── Sample update ─────────────────────────────────────────────────────────────
class SampleUpdate(BaseModel):
    readings:   List[float] = Field(..., min_length=3)
    avg_weight: Optional[float] = Field(None, gt=0)

    @model_validator(mode="after")
    def readings_positive(self) -> "SampleUpdate":
        if any(r <= 0 for r in self.readings):
            raise ValueError("All readings must be positive")
        return self


# ── Sample response ───────────────────────────────────────────────────────────
class SampleOut(BaseModel):
    id:            int
    dept_id:       str
    shift:         str
    timestamp:     datetime
    readings:      List[float]
    avg_weight:    Optional[float]
    mean_hank:     float
    sample_length: float
    unit:          str

    # Snapshot target values (from linked SettingsVersion)
    target_value:  float
    usl_value:     float
    lsl_value:     float

    # Computed stats
    cv:      Optional[float]
    cpk:     Optional[float]
    cp:      Optional[float]
    quality: Optional[str]   # 'ok' | 'warn' | 'bad'
    frame_number:     Optional[int]
    simplex_lane:     Optional[str]
    measurement_type: Optional[str]

    model_config = {"from_attributes": True}


# ── Department overview KPI ───────────────────────────────────────────────────
class DeptKPI(BaseModel):
    dept_id:       str
    name:          str
    short:         str
    unit:          str
    frequency:     str
    target:        float
    tolerance:     float
    usl:           float
    lsl:           float
    uster:         Dict[str, float]
    n:             int                    # number of batches
    mean:          Optional[float]
    sd:            Optional[float]
    cv:            Optional[float]
    cpk:           Optional[float]
    cp:            Optional[float]
    ucl:           Optional[float]
    lcl:           Optional[float]
    wul:           Optional[float]
    wll:           Optional[float]
    quality:       Optional[str]
    subgroup_size: int
    violations:    List[Dict[str, Any]]
    suggestions:   List[str]


# ── Alert ─────────────────────────────────────────────────────────────────────
class Alert(BaseModel):
    dept_id:   str
    dept_name: str
    severity:  str    # 'ok' | 'warn' | 'bad'
    message:   str


# ── Utility calc requests / responses ────────────────────────────────────────
class IIRequest(BaseModel):
    cv_actual:       float = Field(..., gt=0)
    ne:              float = Field(47.0, gt=0)
    fibre_length_mm: float = Field(28.0, gt=0)


class IIResponse(BaseModel):
    cv_theoretical: float
    ii:             float
    status:         str
    msg:            str


class PredictRequest(BaseModel):
    cv_carding: float = Field(..., gt=0)
    cv_drawing: Optional[float] = None    # fetched from DB if omitted
    cv_simplex: Optional[float] = None    # fetched from DB if omitted


# ── YarnLAB ───────────────────────────────────────────────────────────────────
class LabTrialCreate(BaseModel):
    name:        str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = None


class LabTrialUpdate(BaseModel):
    name:        Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = None
    status:      Optional[str] = Field(None, pattern="^(active|complete)$")


class LabBenchmarkItem(BaseModel):
    dept_id:   str
    target:    float = Field(..., gt=0)
    tolerance: float = Field(..., gt=0)


class LabSampleCreate(BaseModel):
    dept_id:       str
    readings:      List[float] = Field(..., min_length=3)
    avg_weight:    Optional[float] = Field(None, gt=0)
    sample_length: float = Field(..., gt=0)
    frame_number:  Optional[int] = None
    notes:         Optional[str] = None

    @model_validator(mode="after")
    def readings_positive(self) -> "LabSampleCreate":
        if any(r <= 0 for r in self.readings):
            raise ValueError("All readings must be positive")
        return self


class RSBCanPayload(BaseModel):
    slot: int = Field(..., ge=1, le=10)
    hank_value: Optional[float] = Field(None, gt=0)
    notes: Optional[str] = Field(None, max_length=200)
    is_perfect: bool = False
    sample_length: float = Field(6.0, gt=0)
    readings: Optional[List[float]] = None


class RSBCanBulkSave(BaseModel):
    cans: List[RSBCanPayload]

    @model_validator(mode="after")
    def validate_slots(self) -> "RSBCanBulkSave":
        slots = [c.slot for c in self.cans]
        if len(slots) != len(set(slots)):
            raise ValueError("Duplicate RSB can slots are not allowed")
        # slot range 1–10 is already enforced per-item by RSBCanPayload.slot Field constraint
        if not (1 <= len(slots) <= 10):
            raise ValueError("Provide between 1 and 10 cans")
        for c in self.cans:
            readings = c.readings or []
            if any(r is not None and r <= 0 for r in readings):
                raise ValueError(f"Can {c.slot}: all readings must be positive numbers")
        return self


class RSBCanOut(RSBCanPayload):
    id: int
    label: str
    readings: List[float]
    readings_count: int
    mean_hank: Optional[float]
    cv_pct: Optional[float]
    status: str


class SimplexBobbinCreate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=60)
    hank_value: Optional[float] = Field(None, gt=0)
    notes: Optional[str] = Field(None, max_length=200)
    verified_same_hank: bool = False
    doff_minutes: int = Field(180, ge=30, le=360)
    sample_length: float = Field(6.0, gt=0)
    rsb_can_ids: List[int] = Field(default_factory=list)
    readings: Optional[List[float]] = None
    machine_number: Optional[int] = Field(None, ge=1, le=3)
    spindle_number: Optional[int] = Field(None, ge=1)

    @model_validator(mode="after")
    def validate_readings(self) -> "SimplexBobbinCreate":
        readings = self.readings or []
        if any(r is not None and r <= 0 for r in readings):
            raise ValueError("Simplex readings must be positive")
        return self


class SimplexBobbinUpdate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=60)
    hank_value: Optional[float] = Field(None, gt=0)
    notes: Optional[str] = Field(None, max_length=200)
    verified_same_hank: Optional[bool] = None
    doff_minutes: Optional[int] = Field(None, ge=30, le=360)
    sample_length: Optional[float] = Field(None, gt=0)
    rsb_can_ids: Optional[List[int]] = None
    readings: Optional[List[float]] = None
    machine_number: Optional[int] = Field(None, ge=1, le=3)
    spindle_number: Optional[int] = Field(None, ge=1)

    @model_validator(mode="after")
    def validate_readings(self) -> "SimplexBobbinUpdate":
        if self.readings is not None:
            readings = self.readings
            if any(r is not None and r <= 0 for r in readings):
                raise ValueError("Simplex readings must be positive")
        return self


class SimplexBobbinOut(BaseModel):
    id: int
    label: str
    hank_value: Optional[float]
    notes: Optional[str]
    verified_same_hank: bool
    doff_minutes: int
    sample_length: float
    rsb_can_ids: List[int]
    rsb_cans: List[RSBCanOut]
    created_at: datetime
    readings: List[float]
    readings_count: int
    mean_hank: Optional[float]
    cv_pct: Optional[float]
    status: str
    machine_number: Optional[int] = None
    spindle_number: Optional[int] = None


class SimplexBobbinRef(BaseModel):
    id: int
    label: str
    hank_value: Optional[float]
    machine_number: Optional[int] = None
    spindle_number: Optional[int] = None


class SimplexInputUpdate(BaseModel):
    """Update per-link (RSB can → Simplex bobbin) readings independently."""
    readings:      List[float] = Field(..., min_length=1)
    sample_length: float = Field(6.0, gt=0)

    @model_validator(mode="after")
    def readings_positive(self) -> "SimplexInputUpdate":
        if any(r <= 0 for r in self.readings):
            raise ValueError("All readings must be positive")
        return self


class SimplexInputOut(BaseModel):
    id:            int
    bobbin_id:     int
    rsb_can_id:    int
    sample_length: Optional[float]
    readings:      List[float]
    readings_count: Optional[int]
    mean_hank:     Optional[float]
    cv_pct:        Optional[float]


class RingframeCopCreate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=60)
    frame_number: Optional[int] = Field(None, ge=1, le=25)
    spindle_number: Optional[int] = Field(None, ge=1)
    hank_value: Optional[float] = Field(None, gt=0)
    notes: Optional[str] = Field(None, max_length=200)
    simplex_bobbin_ids: List[int] = Field(default_factory=list)
    sample_length: float = Field(120.0, gt=0)
    readings: Optional[List[float]] = None

    @model_validator(mode="after")
    def validate_readings(self) -> "RingframeCopCreate":
        readings = self.readings or []
        if len(readings) == 1:
            raise ValueError("Provide at least 2 readings for ring frame cops")
        if any(r is not None and r <= 0 for r in readings):
            raise ValueError("Ring frame readings must be positive")
        return self


class RingframeCopUpdate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=60)
    frame_number: Optional[int] = Field(None, ge=1, le=25)
    spindle_number: Optional[int] = Field(None, ge=1)
    hank_value: Optional[float] = Field(None, gt=0)
    notes: Optional[str] = Field(None, max_length=200)
    simplex_bobbin_ids: Optional[List[int]] = None
    sample_length: Optional[float] = Field(None, gt=0)
    readings: Optional[List[float]] = None

    @model_validator(mode="after")
    def validate_readings(self) -> "RingframeCopUpdate":
        if self.readings is not None:
            readings = self.readings
            if len(readings) == 1:
                raise ValueError("Provide at least 2 readings for ring frame cops")
            if any(r is not None and r <= 0 for r in readings):
                raise ValueError("Ring frame readings must be positive")
        return self


class RingframeCopOut(BaseModel):
    id: int
    label: str
    frame_number: Optional[int] = None
    spindle_number: Optional[int] = None
    hank_value: Optional[float]
    notes: Optional[str]
    sample_length: float
    simplex_bobbin_ids: List[int]
    simplex_bobbins: List[SimplexBobbinRef]
    rsb_cans: List[RSBCanOut]
    created_at: datetime
    readings: List[float]
    readings_count: int
    mean_hank: Optional[float]
    cv_pct: Optional[float]
    status: str


class BenchmarkInfo(BaseModel):
    target: float
    tolerance: float
    cv_limit: float


class RSBSection(BaseModel):
    cans: List[RSBCanOut]
    benchmark: BenchmarkInfo


class SimplexSection(BaseModel):
    bobbins: List[SimplexBobbinOut]
    benchmark: BenchmarkInfo


class RingframeSection(BaseModel):
    cops: List[RingframeCopOut]
    benchmark: BenchmarkInfo


class LabFlowResponse(BaseModel):
    rsb: RSBSection
    simplex: SimplexSection
    ringframe: RingframeSection


# ── Production Module ─────────────────────────────────────────────────────────

class ProductionStdRateOut(BaseModel):
    id:                 int
    dept_id:            str
    machine_number:     Optional[int]
    std_rate_kg_per_hr: float
    label:              Optional[str]
    updated_at:         Optional[datetime]

    model_config = {"from_attributes": True}


class ProductionStdRateUpdate(BaseModel):
    std_rate_kg_per_hr: float = Field(..., gt=0, description="kg/hr per machine")
    label:              Optional[str] = Field(None, max_length=80)
    machine_number:     Optional[int] = Field(None, ge=1)


class ProductionEntryCreate(BaseModel):
    dept_id:        str
    shift:          str = Field(..., pattern="^[ABC]$")
    entry_date:     date
    machine_number: Optional[int] = Field(None, ge=1)
    calc_method:    str = Field(..., pattern="^(efficiency|hank_meter)$")
    notes:          Optional[str] = None
    recorded_at:    Optional[datetime] = None

    # Efficiency method inputs
    efficiency_pct:     Optional[float] = Field(None, gt=0, le=110,
                                                description="Machine efficiency %")
    running_hours:      Optional[float] = Field(None, gt=0, le=12,
                                                description="Shift running hours")
    std_rate_kg_per_hr: Optional[float] = Field(None, gt=0,
                                                description="Standard rate kg/hr (overrides stored)")

    # Hank meter method inputs
    hank_reading:   Optional[float] = Field(None, gt=0,
                                            description="Shift hank counter reading per spindle")
    spindle_count:  Optional[int]   = Field(None, ge=1,
                                            description="Working spindles this shift")
    ne_count:       Optional[float] = Field(None, gt=0,
                                            description="Yarn count (Ne)")

    # Optional secondary (theoretical)
    spindle_rpm: Optional[float] = Field(None, gt=0)
    tpi:         Optional[float] = Field(None, gt=0, description="Turns per inch")

    @model_validator(mode="after")
    def validate_method_inputs(self) -> "ProductionEntryCreate":
        if self.calc_method == "efficiency":
            missing = [f for f in ["efficiency_pct", "running_hours"]
                       if getattr(self, f) is None]
            if missing:
                raise ValueError(f"Efficiency method requires: {', '.join(missing)}")
        elif self.calc_method == "hank_meter":
            missing = [f for f in ["hank_reading", "spindle_count", "ne_count"]
                       if getattr(self, f) is None]
            if missing:
                raise ValueError(f"Hank meter method requires: {', '.join(missing)}")
        return self


class ProductionEntryOut(BaseModel):
    id:             int
    dept_id:        str
    shift:          str
    entry_date:     date
    machine_number: Optional[int]
    calc_method:    str

    # Efficiency method
    efficiency_pct:     Optional[float]
    running_hours:      Optional[float]
    std_rate_kg_per_hr: Optional[float]

    # Hank meter method
    hank_reading:   Optional[float]
    spindle_count:  Optional[int]
    ne_count:       Optional[float]

    # Optional secondary
    spindle_rpm:    Optional[float]
    tpi:            Optional[float]

    # Results
    primary_kg:     float
    theoretical_kg: Optional[float]

    notes:       Optional[str]
    recorded_at: datetime
    created_at:  datetime
    is_void:     bool = False

    model_config = {"from_attributes": True}


class ProductionDeptSummary(BaseModel):
    dept_id:    str
    dept_name:  str
    calc_method: str
    today_kg:   float
    shift_a_kg: float
    shift_b_kg: float
    shift_c_kg: float
    entry_count: int


class ProductionDashboardOut(BaseModel):
    date:      str
    depts:     List[ProductionDeptSummary]
    total_kg:  float


# ── Vendor Master ────────────────────────────────────────────────────────────
# ── Business Partner ──────────────────────────────────────────────────────────
# Valid roles for the role field
BP_ROLES = ("MM_VENDOR", "FI_VENDOR", "FI_CUSTOMER", "SD_CUSTOMER")


class BPCreate(BaseModel):
    bp_code:        str           = Field(..., min_length=1, max_length=40)
    name:           str           = Field(..., min_length=1, max_length=120)  # Name 1
    name_2:         Optional[str] = Field(None, max_length=120)
    grouping:       Optional[str] = Field(None, max_length=40)
    bp_category:    Optional[str] = Field("Organization", max_length=20)     # Organization|Individual
    status:         str           = "Active"
    # Structured address
    street:         Optional[str] = Field(None, max_length=120)
    house_number:   Optional[str] = Field(None, max_length=20)
    city:           Optional[str] = Field(None, max_length=80)
    postal_code:    Optional[str] = Field(None, max_length=20)
    country:        Optional[str] = Field("India", max_length=80)
    region:         Optional[str] = Field(None, max_length=80)
    language:       Optional[str] = Field("EN", max_length=20)
    address:        Optional[str] = None   # LEGACY free-text (kept for compat)
    phone:          Optional[str] = Field(None, max_length=40)
    email:          Optional[str] = Field(None, max_length=120)
    contact_person: Optional[str] = Field(None, max_length=120)
    gst_number:     Optional[str] = Field(None, max_length=40)
    pan:            Optional[str] = Field(None, max_length=20)
    roles:          List[str]     = []   # list of role strings from BP_ROLES


class BPUpdate(BaseModel):
    bp_code:        Optional[str] = Field(None, min_length=1, max_length=40)
    name:           Optional[str] = Field(None, min_length=1, max_length=120)
    name_2:         Optional[str] = Field(None, max_length=120)
    grouping:       Optional[str] = Field(None, max_length=40)
    bp_category:    Optional[str] = Field(None, max_length=20)
    status:         Optional[str] = None
    street:         Optional[str] = Field(None, max_length=120)
    house_number:   Optional[str] = Field(None, max_length=20)
    city:           Optional[str] = Field(None, max_length=80)
    postal_code:    Optional[str] = Field(None, max_length=20)
    country:        Optional[str] = Field(None, max_length=80)
    region:         Optional[str] = Field(None, max_length=80)
    language:       Optional[str] = Field(None, max_length=20)
    address:        Optional[str] = None
    phone:          Optional[str] = None
    email:          Optional[str] = None
    contact_person: Optional[str] = None
    gst_number:     Optional[str] = None
    pan:            Optional[str] = None


class BPRoleOut(BaseModel):
    id:   int
    role: str
    model_config = {"from_attributes": True}


class BPOut(BaseModel):
    id:             int
    bp_code:        str
    name:           str
    name_2:         Optional[str] = None
    grouping:       Optional[str] = None
    bp_category:    Optional[str] = None
    status:         str
    street:         Optional[str] = None
    house_number:   Optional[str] = None
    city:           Optional[str] = None
    postal_code:    Optional[str] = None
    country:        Optional[str] = None
    region:         Optional[str] = None
    language:       Optional[str] = None
    address:        Optional[str] = None
    phone:          Optional[str] = None
    email:          Optional[str] = None
    contact_person: Optional[str] = None
    gst_number:     Optional[str] = None
    pan:            Optional[str] = None
    roles:          List[BPRoleOut] = []
    created_at:     datetime
    model_config = {"from_attributes": True}


class VendorCreate(BaseModel):
    code:           str            = Field(..., min_length=1, max_length=40)
    name:           str            = Field(..., min_length=1, max_length=120)
    contact_person: Optional[str]  = Field(None, max_length=120)
    phone:          Optional[str]  = Field(None, max_length=40)
    email:          Optional[str]  = Field(None, max_length=120)
    gst_number:     Optional[str]  = Field(None, max_length=40)
    address:        Optional[str]  = None

class VendorUpdate(BaseModel):
    name:           Optional[str]  = Field(None, max_length=120)
    contact_person: Optional[str]  = Field(None, max_length=120)
    phone:          Optional[str]  = Field(None, max_length=40)
    email:          Optional[str]  = Field(None, max_length=120)
    gst_number:     Optional[str]  = Field(None, max_length=40)
    address:        Optional[str]  = None
    status:         Optional[str]  = Field(None, pattern="^(active|inactive)$")

class VendorOut(BaseModel):
    id:             int
    code:           str
    name:           str
    contact_person: Optional[str]
    phone:          Optional[str]
    email:          Optional[str]
    gst_number:     Optional[str]
    address:        Optional[str]
    status:         str
    created_at:     datetime

    model_config = {"from_attributes": True}


# ── BP–Material linking (replaces VendorMaterial) ────────────────────────────
class BPMaterialCreate(BaseModel):
    business_partner_id: int
    material_id:         int
    is_preferred:        bool           = False
    lead_time_days:      Optional[float] = None
    last_price:          Optional[float] = None
    last_price_date:     Optional[date]  = None
    notes:               Optional[str]  = None


class BPMaterialOut(BaseModel):
    id:                  int
    business_partner_id: int
    bp_code:             str
    bp_name:             str
    material_id:         int
    material_code:       str
    material_name:       str
    is_preferred:        bool
    lead_time_days:      Optional[float]
    last_price:          Optional[float]
    last_price_date:     Optional[date]
    notes:               Optional[str]
    created_at:          datetime

    model_config = {"from_attributes": True}


# ── Legacy Vendor schemas (kept for backward-compat imports; no active endpoints) ──
class VendorMaterialCreate(BaseModel):
    vendor_id:      int
    material_id:    int
    is_preferred:   bool           = False
    lead_time_days: Optional[float] = None
    last_price:     Optional[float] = None
    last_price_date: Optional[date] = None
    notes:          Optional[str]  = None


class VendorMaterialOut(BaseModel):
    id:             int
    vendor_id:      int
    vendor_code:    str
    vendor_name:    str
    material_id:    int
    material_code:  str
    material_name:  str
    is_preferred:   bool
    lead_time_days: Optional[float]
    last_price:     Optional[float]
    last_price_date: Optional[date]
    notes:          Optional[str]
    created_at:     datetime

    model_config = {"from_attributes": True}


# ── Materials / Inventory / MRP / Purchasing ─────────────────────────────────
class MaterialCreate(BaseModel):
    code:          str           = Field(..., min_length=1, max_length=40)
    name:          str           = Field(..., min_length=1, max_length=120)
    base_unit:     str           = Field(..., min_length=1, max_length=20)
    material_type: Optional[str] = Field(None, max_length=40)
    category:      Optional[str] = Field(None, max_length=60)
    description:   Optional[str] = None
    notes:         Optional[str] = None   # alias — stored in description column


class MaterialUpdate(BaseModel):
    """All fields optional — only provided fields are updated."""
    code:          Optional[str] = Field(None, min_length=1, max_length=40)
    name:          Optional[str] = Field(None, min_length=1, max_length=120)
    base_unit:     Optional[str] = Field(None, min_length=1, max_length=20)
    material_type: Optional[str] = Field(None, max_length=40)
    category:      Optional[str] = Field(None, max_length=60)
    description:   Optional[str] = None
    notes:         Optional[str] = None   # alias — stored in description column


class MaterialOut(BaseModel):
    id:            int
    code:          str
    name:          str
    base_unit:     str
    material_type: Optional[str]
    category:      Optional[str]
    description:   Optional[str]
    notes:         Optional[str] = None  # client alias for description
    is_active:     bool

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, **kw):
        inst = super().model_validate(obj, **kw)
        inst.notes = inst.description
        return inst


class InventoryMovementOut(BaseModel):
    id: int
    material_id: int
    material_code: str
    material_name: str
    movement_type: str
    source_type: str
    source_id: Optional[int]
    quantity_delta: float
    unit: str
    lot_id: Optional[str]
    movement_date: date
    notes: Optional[str]
    created_at: datetime


class MaterialIssueLineCreate(BaseModel):
    material_id: int
    quantity: float = Field(..., gt=0)
    lot_id: Optional[str] = None


class MaterialIssueCreate(BaseModel):
    issue_date: date
    purpose:    str           = "Production"   # Production|Maintenance|General
    reference:  Optional[str] = Field(None, max_length=120)
    notes:      Optional[str] = None
    lines:      List[MaterialIssueLineCreate] = Field(..., min_length=1)


class MaterialIssueLineOut(BaseModel):
    id: int
    material_id: int
    material_code: str
    material_name: str
    quantity: float
    unit: str
    lot_id: Optional[str]
    movement_type: str


class MaterialIssueOut(BaseModel):
    id: int
    document_number: str
    issue_date: date
    shift: Optional[str]
    reference: Optional[str]
    status: str
    created_at: datetime
    lines: List[MaterialIssueLineOut]


class MaterialPlanningParamUpdate(BaseModel):
    lead_time_days: float = Field(..., ge=0)
    safety_stock_qty: float = Field(..., ge=0)
    reorder_qty: float = Field(..., gt=0)
    critical_days_left: float = Field(2.0, ge=0)


class MaterialMarketPriceCreate(BaseModel):
    price_date: date
    price: float = Field(..., gt=0)
    unit: Optional[str] = None


class MaterialMarketPriceOut(BaseModel):
    id: int
    material_id: int
    price_date: date
    price: float
    unit: str

    model_config = {"from_attributes": True}


class PurchaseRecommendationOut(BaseModel):
    id: int
    material_id: int
    material_code: str
    material_name: str
    status: str
    suggested_qty: float
    unit: str
    reason: str
    decision_support: Optional[str]
    stock_at_creation: float
    reorder_level: float
    avg_consumption: float
    price_trend: Optional[str]
    created_at: datetime


class InventoryOverviewItem(BaseModel):
    material_id: int
    material_code: str
    material_name: str
    unit: str
    stock: float
    daily_consumption: float
    avg_consumption_7d: float
    days_left: Optional[float]
    lead_time_days: float
    safety_stock_qty: float
    reorder_qty: float
    reorder_level: float
    status: str
    action: str
    price_trend: str
    last_market_price: Optional[float] = None
    recommendation: Optional[PurchaseRecommendationOut] = None


class PurchaseOrderCreate(BaseModel):
    quantity:            Optional[float] = Field(None, gt=0)
    rate:                float           = Field(..., gt=0)
    business_partner_id: Optional[int]  = None   # must have MM_VENDOR role
    supplier:            Optional[str]  = Field(None, max_length=120)   # free-text fallback
    order_date:          Optional[date] = None


class PurchaseOrderLineOut(BaseModel):
    id:                int
    recommendation_id: Optional[int]
    material_id:       int
    material_code:     str
    material_name:     str
    quantity_ordered:  float
    quantity_received: float
    unit:              str
    rate:              float


class PurchaseOrderOut(BaseModel):
    id:                    int
    po_number:             str
    business_partner_id:   Optional[int]
    business_partner_name: Optional[str]
    supplier:              Optional[str]
    status:                str
    order_date:            date
    created_at:            datetime
    lines:                 List[PurchaseOrderLineOut]


# ── GR: PO-based (receive against an open PO) ────────────────────────────────
class GoodsReceiptLineCreate(BaseModel):
    po_line_id:        int
    quantity_received: float        = Field(..., gt=0)
    rate:              Optional[float] = Field(None, gt=0)
    lot_id:            Optional[str] = None


class GoodsReceiptCreate(BaseModel):
    receipt_date: Optional[date]   = None
    reference:    Optional[str]    = Field(None, max_length=120)
    notes:        Optional[str]    = None
    lines:        List[GoodsReceiptLineCreate] = Field(..., min_length=1)


# ── GR: Direct vendor GR (no PO required — vendor invoice / opening stock) ───
class DirectGRLineCreate(BaseModel):
    material_id:       int
    quantity_received: float        = Field(..., gt=0)
    unit:              Optional[str] = None  # falls back to material.base_unit
    rate:              Optional[float] = Field(None, ge=0)
    lot_id:            Optional[str] = None


class DirectGRCreate(BaseModel):
    business_partner_id: int               # must have MM_VENDOR role
    document_date:       Optional[date] = None   # date on supplier invoice
    receipt_date:        Optional[date] = None   # posting date (defaults to today)
    reference:           Optional[str]  = Field(None, max_length=120)
    notes:               Optional[str]  = None
    lines:               List[DirectGRLineCreate] = Field(..., min_length=1)


class GoodsReceiptLineOut(BaseModel):
    id:                int
    material_id:       int
    material_code:     str
    material_name:     str
    material_category: Optional[str]
    lot_id:            Optional[str]
    quantity_received: float
    unit:              str
    rate:              Optional[float]
    amount:            Optional[float]   # rate × quantity_received


class GoodsReceiptOut(BaseModel):
    id:                    int
    gr_number:             str
    purchase_order_id:     Optional[int]
    business_partner_id:   Optional[int]
    business_partner_name: Optional[str]
    document_date:         Optional[date]
    receipt_date:          date
    reference:             Optional[str]
    attachment_url:        Optional[str]
    notes:                 Optional[str]
    created_at:            datetime
    lines:                 List[GoodsReceiptLineOut]


# ── Quick receipt (legacy / opening stock — kept for backward compat) ─────────
class QuickReceiptLineCreate(BaseModel):
    material_id: int
    quantity:    float = Field(..., gt=0)

class QuickReceiptCreate(BaseModel):
    receipt_date: Optional[date]  = None
    reference:    Optional[str]   = Field(None, max_length=120)
    notes:        Optional[str]   = None
    lines:        List[QuickReceiptLineCreate] = Field(..., min_length=1)

class QuickReceiptOut(BaseModel):
    gr_number:    str
    receipt_date: date
    lines_posted: int
    created_at:   datetime


# ── Lot-level stock overview ──────────────────────────────────────────────────
class StockLotItem(BaseModel):
    material_id:       int
    material_code:     str
    material_name:     str
    material_category: Optional[str]
    lot_id:            str          # '' means no lot assigned
    unit:              str
    opening_stock:     float        # stock at start of current month
    receipts_mtd:      float        # receipts month-to-date
    issues_mtd:        float        # issues month-to-date (positive number)
    closing_stock:     float        # current balance


# ── Error response (used by global exception handler) ────────────────────────
class ErrorResponse(BaseModel):
    detail:    str
    error_type: str

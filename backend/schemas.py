"""
schemas.py — Pydantic v2 request / response models
"""

from __future__ import annotations

from datetime import datetime
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
    readings:      List[float] = Field(..., min_length=3, max_length=50)
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
    readings:   List[float] = Field(..., min_length=3, max_length=50)
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
    readings:      List[float] = Field(..., min_length=3, max_length=50)
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
    slot: int = Field(..., ge=1, le=5)
    hank_value: Optional[float] = Field(None, gt=0)
    notes: Optional[str] = Field(None, max_length=200)
    is_perfect: bool = False


class RSBCanBulkSave(BaseModel):
    cans: List[RSBCanPayload]

    @model_validator(mode="after")
    def validate_slots(self) -> "RSBCanBulkSave":
        slots = [c.slot for c in self.cans]
        if len(slots) != len(set(slots)):
            raise ValueError("Duplicate RSB can slots are not allowed")
        if any(slot < 1 or slot > 5 for slot in slots):
            raise ValueError("RSB slots must be between 1 and 5")
        if len(slots) != 5:
            raise ValueError("Provide exactly 5 cans (slots 1–5)")
        return self


class RSBCanOut(RSBCanPayload):
    id: int
    label: str


class SimplexBobbinCreate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=60)
    hank_value: Optional[float] = Field(None, gt=0)
    notes: Optional[str] = Field(None, max_length=200)
    verified_same_hank: bool = False
    doff_minutes: int = Field(180, ge=30, le=360)
    rsb_can_ids: List[int] = Field(default_factory=list)


class SimplexBobbinUpdate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=60)
    hank_value: Optional[float] = Field(None, gt=0)
    notes: Optional[str] = Field(None, max_length=200)
    verified_same_hank: Optional[bool] = None
    doff_minutes: Optional[int] = Field(None, ge=30, le=360)
    rsb_can_ids: Optional[List[int]] = None


class SimplexBobbinOut(BaseModel):
    id: int
    label: str
    hank_value: Optional[float]
    notes: Optional[str]
    verified_same_hank: bool
    doff_minutes: int
    rsb_can_ids: List[int]
    rsb_cans: List[RSBCanOut]
    created_at: datetime


class SimplexBobbinRef(BaseModel):
    id: int
    label: str
    hank_value: Optional[float]


class RingframeCopCreate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=60)
    hank_value: Optional[float] = Field(None, gt=0)
    notes: Optional[str] = Field(None, max_length=200)
    simplex_bobbin_ids: List[int] = Field(default_factory=list)


class RingframeCopUpdate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=60)
    hank_value: Optional[float] = Field(None, gt=0)
    notes: Optional[str] = Field(None, max_length=200)
    simplex_bobbin_ids: Optional[List[int]] = None


class RingframeCopOut(BaseModel):
    id: int
    label: str
    hank_value: Optional[float]
    notes: Optional[str]
    simplex_bobbin_ids: List[int]
    simplex_bobbins: List[SimplexBobbinRef]
    rsb_cans: List[RSBCanOut]
    created_at: datetime


class RSBSection(BaseModel):
    cans: List[RSBCanOut]


class SimplexSection(BaseModel):
    bobbins: List[SimplexBobbinOut]


class RingframeSection(BaseModel):
    cops: List[RingframeCopOut]


class LabFlowResponse(BaseModel):
    rsb: RSBSection
    simplex: SimplexSection
    ringframe: RingframeSection


# ── Error response (used by global exception handler) ────────────────────────
class ErrorResponse(BaseModel):
    detail:    str
    error_type: str

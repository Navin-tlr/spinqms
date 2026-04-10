"""
logic.py — SpinQMS Statistical Quality Control Engine
=======================================================
Pure functions only — no database access.

Design principles
─────────────────
• All array operations use NumPy for vectorized, numerically stable execution.
• WelfordAccumulator implements Welford's online algorithm for computing
  variance in a single pass with O(1) memory — used for high-volume data
  streaming without accumulating the full readings array.
• Every function that can receive n<2 or σ=0 handles those edge cases
  explicitly and returns None / empty list rather than raising.
• Department definitions come from the database (models.Department) and are
  passed in as dicts via Department.to_dict().  The old hardcoded DEPTS
  constant has been removed.
"""

from __future__ import annotations

import math
from typing import List, Optional

import numpy as np


# ── Hank formula (ISO 11462-1) ────────────────────────────────────────────────
def weight_to_hank(weight_grams: float, length_yards: float) -> float:
    """
    Ne = (L × 0.54) / W_grams
    Derivation: Ne = L(yds)/(840 × W(lbs)) = L × 453.592/(840 × W_g) = L × 0.54/W_g
    """
    if weight_grams <= 0:
        raise ValueError(f"weight_grams must be positive, got {weight_grams}")
    return (length_yards * 0.54) / weight_grams


def hank_to_weight(hank: float, length_yards: float) -> float:
    """Inverse: W = (L × 0.54) / Ne"""
    if hank <= 0:
        raise ValueError(f"hank must be positive, got {hank}")
    return (length_yards * 0.54) / hank


# ── Welford's online algorithm ────────────────────────────────────────────────
class WelfordAccumulator:
    """
    Welford's single-pass, numerically stable variance algorithm.

    Use this when you cannot hold all readings in memory at once, or when
    streaming data from a database cursor.  At any point, .finalize() returns
    the same statistics as calc_stats() would for the accumulated values.

    Reference: Welford, B. P. (1962). Technometrics 4(3), 419–420.
    """

    __slots__ = ("n", "_mean", "_M2")

    def __init__(self) -> None:
        self.n: int = 0
        self._mean: float = 0.0
        self._M2: float = 0.0

    def update(self, x: float) -> None:
        """Incorporate a single new observation."""
        self.n += 1
        delta = x - self._mean
        self._mean += delta / self.n
        delta2 = x - self._mean
        self._M2 += delta * delta2

    def update_batch(self, values) -> None:
        """Incorporate an iterable of observations."""
        for x in values:
            self.update(float(x))

    @property
    def mean(self) -> float:
        return self._mean

    @property
    def variance(self) -> Optional[float]:
        """Bessel-corrected sample variance.  None if n < 2."""
        return self._M2 / (self.n - 1) if self.n >= 2 else None

    @property
    def sd(self) -> Optional[float]:
        v = self.variance
        return math.sqrt(v) if v is not None and v >= 0 else None

    def finalize(self) -> Optional[dict]:
        """
        Return {n, mean, sd, cv} if n ≥ 2, else None.
        Compatible with calc_stats() return format.
        """
        if self.n < 2:
            return None
        sd = self.sd
        if sd is None:
            return None
        cv = (sd / self._mean) * 100.0 if self._mean != 0 else 0.0
        return {"n": self.n, "mean": self._mean, "sd": sd, "cv": cv}

    @classmethod
    def from_array(cls, arr) -> "WelfordAccumulator":
        acc = cls()
        acc.update_batch(arr)
        return acc


# ── Vectorized descriptive statistics ────────────────────────────────────────
def calc_stats(arr) -> Optional[dict]:
    """
    Vectorized stats using NumPy.

    Accepts Python lists, NumPy arrays, or any array-like.
    Returns {n, mean, sd, cv} or None when n < 2.

    Uses np.std(ddof=1) for Bessel-corrected sample standard deviation.
    Zero-mean guard prevents ZeroDivisionError on pathological data.
    """
    a = np.asarray(arr, dtype=np.float64)
    n = int(a.size)
    if n < 2:
        return None

    mean = float(np.mean(a))
    sd   = float(np.std(a, ddof=1))       # Bessel-corrected sample SD

    # Guard: sd=0 is valid (all readings identical) — CV is 0, not ∞
    cv = (sd / mean) * 100.0 if mean != 0.0 else 0.0

    return {"n": n, "mean": mean, "sd": sd, "cv": cv}


# ── Process capability ────────────────────────────────────────────────────────
def calc_cpk(mean: float, sd: float, usl: float, lsl: float) -> Optional[float]:
    """
    Cpk = min[(USL − x̄) / 3σ,  (x̄ − LSL) / 3σ]
    Returns None when sd ≤ 0 (process width undefined).
    """
    if sd <= 0:
        return None
    return min((usl - mean) / (3.0 * sd), (mean - lsl) / (3.0 * sd))


def calc_cp(sd: float, usl: float, lsl: float) -> Optional[float]:
    """
    Cp = (USL − LSL) / 6σ
    Returns None when sd ≤ 0.
    """
    if sd <= 0:
        return None
    return (usl - lsl) / (6.0 * sd)


def calc_control_limits(mean: float, sd: float, subgroup_size: int) -> dict:
    """
    X-bar control limits.

    When called with batch-mean arrays (recommended for overview):
        subgroup_size = 1   →  UCL = mean ± 3·σ_means
    When called with individual readings (legacy):
        subgroup_size = n   →  UCL = mean ± 3·σ / √n

    Guards:
      • sd = 0     → all limits = mean (degenerate but non-crashing)
      • n < 1      → clamped to 1
    """
    if sd < 0:
        sd = 0.0
    sqn = math.sqrt(max(subgroup_size, 1))
    spread2 = 2.0 * sd / sqn
    spread3 = 3.0 * sd / sqn
    return {
        "ucl": mean + spread3,
        "lcl": mean - spread3,
        "wul": mean + spread2,
        "wll": mean - spread2,
    }


# ── Quality status ────────────────────────────────────────────────────────────
def quality_status(cv: float, cpk: Optional[float], dept: dict) -> str:
    """
    Classify a department's current state as 'ok' | 'warn' | 'bad'.
    dept must be a logic-compatible dict with 'us' key.
    """
    if cpk is not None and cpk < 1.0:
        return "bad"
    us = dept["us"]
    if cv <= us["p25"]:
        return "ok"
    if cv <= us["p50"]:
        return "warn"
    return "bad"


# ── Western Electric Rules (numpy-vectorized) ─────────────────────────────────
def detect_we_violations(
    arr,
    mean: float,
    sd: float,
    subgroup_size: int = 1,
) -> List[dict]:
    """
    Evaluates Western Electric rules on an array of *batch means*.

    Rule 1: Any point beyond ±3σ action limit.
    Rule 2: 2 of 3 consecutive points beyond ±2σ warning (same side).
    Rule 4: 8 consecutive points same side of the grand mean (drift).

    Parameters
    ──────────
    arr           : array of batch mean_hank values (one per saved batch)
    mean          : grand mean of arr
    sd            : standard deviation of arr
    subgroup_size : readings per batch (used for X-bar limit scaling).
                    Pass 1 when arr already contains batch means and sd is
                    computed from those means (recommended).

    Returns list of {rule, severity, msg}.  Empty list = no violations.

    Edge cases
    ──────────
    • len(arr) < 2 or sd == 0 → returns []
    • All-identical data (sd=0) → no violations by definition
    """
    a = np.asarray(arr, dtype=np.float64)
    if a.size < 2 or sd <= 0:
        return []

    violations: List[dict] = []
    sqn = math.sqrt(max(subgroup_size, 1))
    u3 = mean + 3.0 * sd / sqn
    l3 = mean - 3.0 * sd / sqn
    u2 = mean + 2.0 * sd / sqn
    l2 = mean - 2.0 * sd / sqn

    # ── Rule 1: 1 point beyond 3σ ─────────────────────────────────────────
    beyond3 = (a > u3) | (a < l3)
    if beyond3.any():
        idx = int(np.argmax(beyond3)) + 1   # 1-indexed
        violations.append({
            "rule": 1,
            "severity": "bad",
            "msg": f"Batch {idx} beyond 3σ action limit",
        })

    # ── Rule 2: 2 of 3 consecutive beyond ±2σ (same side) ────────────────
    above2 = (a > u2).astype(np.int8)
    below2 = (a < l2).astype(np.int8)
    kernel = np.ones(3, dtype=np.int8)
    if a.size >= 3:
        above_sum = np.convolve(above2, kernel, mode="valid")
        below_sum = np.convolve(below2, kernel, mode="valid")
        trigger = (above_sum >= 2) | (below_sum >= 2)
        if trigger.any():
            i = int(np.argmax(trigger))
            violations.append({
                "rule": 2,
                "severity": "warn",
                "msg": f"2 of 3 batches beyond 2σ warning (batches {i+1}–{i+3})",
            })

    # ── Rule 4: 8 consecutive same side of mean ───────────────────────────
    if a.size >= 8:
        above_m = (a > mean).astype(np.int8)
        below_m = (a < mean).astype(np.int8)
        k8 = np.ones(8, dtype=np.int8)
        above8 = np.convolve(above_m, k8, mode="valid")
        below8 = np.convolve(below_m, k8, mode="valid")
        drift = (above8 == 8) | (below8 == 8)
        if drift.any():
            i = int(np.argmax(drift))
            violations.append({
                "rule": 4,
                "severity": "warn",
                "msg": f"8 consecutive batches same side of mean — drift (batches {i+1}–{i+8})",
            })

    return violations


# ── Machine suggestions ───────────────────────────────────────────────────────
def get_machine_suggestions(
    dept: dict,
    batch_means: List[float],
    mean: float,
    sd: float,
    cv: float,
    cpk: Optional[float],
    usl: float,
    lsl: float,
    subgroup_size: int = 1,
) -> List[str]:
    """
    dept: logic-compatible dict from Department.to_dict()
    batch_means: array of batch mean_hank values (for WE rule evaluation)
    """
    suggestions: List[str] = []

    if cpk is not None and cpk < 1.0:
        suggestions.append("Process not capable — Needs attention")

    if cv > dept["us"]["p75"]:
        suggestions.append("High CV% — Needs attention")

    if len(batch_means) >= 3:
        violations = detect_we_violations(batch_means, mean, sd, subgroup_size)
        if any(v["rule"] == 1 for v in violations):
            suggestions.append("Action Limit Exceeded — Machine requires immediate attention")
        if any(v["rule"] == 2 for v in violations):
            suggestions.append("Warning Limit Breach — Needs attention")
        if any(v["rule"] == 4 for v in violations):
            suggestions.append("Systematic Drift Detected — Needs attention")

    if mean > usl:
        suggestions.append("Count above upper limit — Needs attention")
    elif mean < lsl:
        suggestions.append("Count below lower limit — Needs attention")

    return suggestions


# ── Index of Irregularity ─────────────────────────────────────────────────────
def calc_irregularity_index(
    cv_actual: float,
    ne: float,
    fibre_length_mm: float,
) -> dict:
    """
    I = CV_actual / CV_theoretical
    CV_th = 100 / √(2 · Ne · L(cm) · ρ)   where ρ = 1.52 g/cm³ (cotton)
    """
    if ne <= 0 or fibre_length_mm <= 0:
        raise ValueError("ne and fibre_length_mm must be positive")
    cv_theoretical = 100.0 / math.sqrt(2.0 * ne * (fibre_length_mm / 10.0) * 1.52)
    ii = cv_actual / cv_theoretical

    if ii < 1.1:
        status, msg = "ok",   "Excellent — near ideal random drafting"
    elif ii < 1.3:
        status, msg = "warn", "Acceptable — minor irregularity"
    elif ii < 1.5:
        status, msg = "warn", "High — check drafting system"
    else:
        status, msg = "bad",  "Critical — systematic machine fault"

    return {"cv_theoretical": cv_theoretical, "ii": ii, "status": status, "msg": msg}


# ── Upstream prediction ───────────────────────────────────────────────────────
def predict_ring_frame_cv(
    cv_carding: float,
    cv_drawing: float,
    cv_simplex: float,
) -> float:
    """CV_RF ≈ √(CV_card² + CV_draw² + CV_simp²)  [Root Sum of Squares]"""
    return math.sqrt(cv_carding ** 2 + cv_drawing ** 2 + cv_simplex ** 2)


# ── Decimal precision helper ──────────────────────────────────────────────────
def decimal_places(target: float) -> int:
    """Ring Frame / Autoconer targets (≥10) use 2dp; sliver stages use 4dp."""
    return 2 if target >= 10 else 4

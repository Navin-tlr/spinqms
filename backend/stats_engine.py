"""
stats_engine.py — Statistical analysis engine for YarnLAB Interaction Report
=============================================================================

Provides ANOVA-based analysis of Ring Frame cop hank values to identify
significant variance sources: frame effect, machine effect, and their
interaction.

Usage
-----
    from stats_engine import run_interaction_anova
    result = run_interaction_anova(cops_data)

Input shape (cops_data)
-----------------------
    List of dicts, each representing one Ring Frame cop:
    {
        "cop_id":        int,
        "cop_hank":      float | None,
        "frame_number":  int   | None,
        "machine_number": int  | None,   # Simplex machine that fed this cop
    }

Output
------
    On success:
    {
        "status":           "ok",
        "mode":             "one_way" | "two_way",
        "n":                int,            # rows used in analysis
        "frame_effect":     { "f": float, "p": float, "significant": bool },
        "machine_effect":   { "f": float, "p": float, "significant": bool } | None,
        "interaction":      { "f": float, "p": float, "significant": bool } | None,
    }

    On failure (insufficient data):
    { "status": "insufficient_data", "reason": str }
"""

from __future__ import annotations

from typing import Any, Dict, List

import numpy as np

ALPHA = 0.05


def run_interaction_anova(cops_data: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Run One-Way or Two-Way ANOVA on Ring Frame cop hank measurements.

    Falls back gracefully when:
      - Too few data points
      - Only one unique machine number (One-Way only)
      - Linear algebra errors (singular matrices)
      - Missing scipy / statsmodels / pandas
    """
    try:
        import pandas as pd
        from scipy import stats as scipy_stats
    except ImportError as exc:
        return {"status": "insufficient_data", "reason": f"Missing dependency: {exc}"}

    # ── Build DataFrame ──────────────────────────────────────────────────────
    rows = []
    for c in cops_data:
        cop_hank = c.get("cop_hank")
        frame    = c.get("frame_number")
        machine  = c.get("machine_number")
        if cop_hank is None or frame is None:
            continue
        rows.append({
            "cop_hank":      float(cop_hank),
            "frame_number":  int(frame),
            "machine_number": int(machine) if machine is not None else None,
        })

    if len(rows) < 4:
        return {"status": "insufficient_data", "reason": "Fewer than 4 valid cop measurements"}

    try:
        df = pd.DataFrame(rows)
    except Exception as exc:
        return {"status": "insufficient_data", "reason": str(exc)}

    unique_frames   = df["frame_number"].nunique()
    unique_machines = df["machine_number"].dropna().nunique()

    if unique_frames < 2:
        return {"status": "insufficient_data", "reason": "Need at least 2 distinct frame numbers"}

    # ── One-Way ANOVA (single machine or all machine_number=None) ────────────
    if unique_machines <= 1:
        try:
            groups = [grp["cop_hank"].values for _, grp in df.groupby("frame_number")]
            if any(len(g) < 1 for g in groups):
                return {"status": "insufficient_data", "reason": "Some frames have no data"}
            f_stat, p_val = scipy_stats.f_oneway(*groups)
            if np.isnan(f_stat) or np.isnan(p_val):
                return {"status": "insufficient_data", "reason": "ANOVA returned NaN (constant data?)"}
            return {
                "status":         "ok",
                "mode":           "one_way",
                "n":              len(df),
                "frame_effect":   {"f": round(float(f_stat), 4), "p": round(float(p_val), 4), "significant": bool(p_val < ALPHA)},
                "machine_effect": None,
                "interaction":    None,
            }
        except (ValueError, TypeError) as exc:
            return {"status": "insufficient_data", "reason": str(exc)}

    # ── Two-Way ANOVA (multiple machines) ───────────────────────────────────
    try:
        import statsmodels.formula.api as smf
        from statsmodels.stats.anova import anova_lm

        # Drop rows missing machine_number for two-way analysis
        df2 = df.dropna(subset=["machine_number"]).copy()
        df2["machine_number"] = df2["machine_number"].astype(int)

        if len(df2) < 4:
            return {"status": "insufficient_data", "reason": "Fewer than 4 rows after dropping missing machine numbers"}
        if df2["frame_number"].nunique() < 2:
            return {"status": "insufficient_data", "reason": "Need at least 2 distinct frames after filtering"}
        if df2["machine_number"].nunique() < 2:
            # Fallback to one-way
            groups = [grp["cop_hank"].values for _, grp in df2.groupby("frame_number")]
            f_stat, p_val = scipy_stats.f_oneway(*groups)
            if np.isnan(f_stat) or np.isnan(p_val):
                return {"status": "insufficient_data", "reason": "ANOVA returned NaN"}
            return {
                "status":         "ok",
                "mode":           "one_way",
                "n":              len(df2),
                "frame_effect":   {"f": round(float(f_stat), 4), "p": round(float(p_val), 4), "significant": bool(p_val < ALPHA)},
                "machine_effect": None,
                "interaction":    None,
            }

        formula = "cop_hank ~ C(machine_number) + C(frame_number) + C(machine_number):C(frame_number)"
        model   = smf.ols(formula, data=df2).fit()
        table   = anova_lm(model, typ=2)

        def _row(key: str):
            """Extract F and p from an anova_lm Type-II table row."""
            try:
                row = table.loc[key]
                f = float(row["F"])
                p = float(row["PR(>F)"])
                if np.isnan(f) or np.isnan(p):
                    return None
                return {"f": round(f, 4), "p": round(p, 4), "significant": bool(p < ALPHA)}
            except (KeyError, TypeError, ValueError):
                return None

        frame_eff   = _row("C(frame_number)")
        machine_eff = _row("C(machine_number)")
        interaction = _row("C(machine_number):C(frame_number)")

        if frame_eff is None:
            return {"status": "insufficient_data", "reason": "Could not extract frame effect from ANOVA table"}

        return {
            "status":         "ok",
            "mode":           "two_way",
            "n":              len(df2),
            "frame_effect":   frame_eff,
            "machine_effect": machine_eff,
            "interaction":    interaction,
        }

    except Exception as exc:  # noqa: BLE001  (broad catch: LinAlgError, PerfectSeparationError, etc.)
        return {"status": "insufficient_data", "reason": str(exc)}


# ── Hierarchical variation analysis ───────────────────────────────────────────

def run_hierarchical_variation(hierarchy: list) -> dict:
    """
    4-level variation analysis on the Can → Bobbin → Cop hierarchy.

    Input: hierarchy list as built by the interaction report endpoint.
    Each can has .bobbins; each bobbin has .cops; each cop has mean_hank / cv_pct.

    Output:
      level1: between-can variation  (compare can means)
      level2: between-bobbin variation within each can
      level3: between-cop variation within each bobbin
      level4: within-cop variation (the stored cv_pct per cop)
    """

    def _cv(vals: list) -> float | None:
        """Population-style CV% from a list of floats (requires ≥ 2 values)."""
        if len(vals) < 2:
            return None
        m = sum(vals) / len(vals)
        if m == 0:
            return None
        variance = sum((v - m) ** 2 for v in vals) / (len(vals) - 1)
        sd = variance ** 0.5
        return round((sd / m) * 100, 4)

    def _stats(vals: list) -> dict:
        if not vals:
            return {"n": 0, "mean": None, "range": None, "cv": None}
        n = len(vals)
        mean = round(sum(vals) / n, 6)
        rng = round(max(vals) - min(vals), 6) if n >= 2 else None
        cv = _cv(vals)
        return {"n": n, "mean": mean, "range": rng, "cv": cv}

    # ── Level 1: Between cans ────────────────────────────────────────────────
    can_entries = []
    for can in hierarchy:
        if can.get("mean_hank") is not None:
            can_entries.append({
                "label": can["label"],
                "slot": can.get("slot"),
                "mean": can["mean_hank"],
                "cv_pct": can.get("cv_pct"),
                "n_bobbins": len(can.get("bobbins", [])),
            })
    can_means = [c["mean"] for c in can_entries]
    level1 = {**_stats(can_means), "cans": can_entries}

    # ── Level 2: Between bobbins within same can ─────────────────────────────
    level2 = []
    for can in hierarchy:
        bobbins = can.get("bobbins", [])
        bobbin_entries = [
            {
                "label": b["label"],
                "machine_number": b.get("machine_number"),
                "spindle_number": b.get("spindle_number"),
                "mean": b["mean_hank"],
                "cv_pct": b.get("cv_pct"),
            }
            for b in bobbins
            if b.get("mean_hank") is not None
        ]
        if not bobbin_entries:
            continue
        vals = [b["mean"] for b in bobbin_entries]
        level2.append({
            "can_label": can["label"],
            "can_slot": can.get("slot"),
            "bobbins": bobbin_entries,
            **_stats(vals),
        })

    # ── Level 3: Between cops within same bobbin ─────────────────────────────
    level3 = []
    for can in hierarchy:
        for bobbin in can.get("bobbins", []):
            cop_entries = [
                {
                    "label": c["label"],
                    "frame_number": c.get("frame_number"),
                    "spindle_number": c.get("spindle_number"),
                    "mean": c["mean_hank"],
                    "cv_pct": c.get("cv_pct"),
                }
                for c in bobbin.get("cops", [])
                if c.get("mean_hank") is not None
            ]
            if not cop_entries:
                continue
            vals = [c["mean"] for c in cop_entries]
            level3.append({
                "bobbin_label": bobbin["label"],
                "can_label": can["label"],
                "machine_number": bobbin.get("machine_number"),
                "spindle_number": bobbin.get("spindle_number"),
                "cops": cop_entries,
                **_stats(vals),
            })

    # ── Level 4: Within-cop reading variation (stored cv_pct) ────────────────
    level4 = []
    for can in hierarchy:
        for bobbin in can.get("bobbins", []):
            for cop in bobbin.get("cops", []):
                if cop.get("cv_pct") is not None:
                    level4.append({
                        "cop_label": cop["label"],
                        "bobbin_label": bobbin["label"],
                        "can_label": can["label"],
                        "frame_number": cop.get("frame_number"),
                        "spindle_number": cop.get("spindle_number"),
                        "mean_hank": cop.get("mean_hank"),
                        "cv_pct": cop["cv_pct"],
                        "n_readings": cop.get("n_readings", 0),
                    })

    # Sort level4 descending by cv_pct so worst offenders appear first
    level4.sort(key=lambda x: x["cv_pct"], reverse=True)

    return {
        "level1": level1,
        "level2": level2,
        "level3": level3,
        "level4": level4,
    }

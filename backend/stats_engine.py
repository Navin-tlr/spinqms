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

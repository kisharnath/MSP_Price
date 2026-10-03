"""
MSP parsing and normalization module.
Parses raw extracted tables into normalized Pandas DataFrames and runs data validation.
"""

import re
import logging
from typing import Dict, Any, List, Optional, Tuple
import pandas as pd

logger = logging.getLogger(__name__)

# Canonical crop registry and alias mappings
CANONICAL_CROPS = {
    "wheat": {
        "canonical_name": "Wheat",
        "aliases": ["gehu", "gehun", "wheat"],
        "display_aliases": ["Gehu"]
    },
    "barley": {
        "canonical_name": "Barley",
        "aliases": ["jau", "barley"],
        "display_aliases": ["Jau"]
    },
    "gram": {
        "canonical_name": "Gram",
        "aliases": ["chana", "channa", "gram", "bengal gram", "chickpea"],
        "display_aliases": ["Chana"]
    },
    "lentil_masur": {
        "canonical_name": "Lentil (Masur)",
        "aliases": ["lentil", "masur", "masoor", "lentil (masur)", "masur (lentil)"],
        "display_aliases": ["Masur", "Masoor"]
    },
    "rapeseed_mustard": {
        "canonical_name": "Rapeseed & Mustard",
        "aliases": ["rapeseed & mustard", "rapeseed and mustard", "mustard", "sarson", "rai", "toria"],
        "display_aliases": ["Sarson", "Mustard"]
    },
    "safflower": {
        "canonical_name": "Safflower",
        "aliases": ["safflower", "kusum", "kardi"],
        "display_aliases": ["Kusum"]
    },
    # Kharif crops for system breadth
    "paddy_common": {
        "canonical_name": "Paddy (Common)",
        "aliases": ["paddy", "paddy common", "dhan"],
        "display_aliases": ["Dhan"]
    },
    "paddy_grade_a": {
        "canonical_name": "Paddy (Grade A)",
        "aliases": ["paddy grade a", "paddy (grade a)"],
        "display_aliases": []
    },
    "jowar_hybrid": {
        "canonical_name": "Jowar (Hybrid)",
        "aliases": ["jowar hybrid", "jowar"],
        "display_aliases": ["Jowar"]
    },
    "bajra": {
        "canonical_name": "Bajra",
        "aliases": ["bajra", "pearl millet"],
        "display_aliases": []
    },
    "maize": {
        "canonical_name": "Maize",
        "aliases": ["maize", "makka"],
        "display_aliases": ["Makka"]
    },
    "ragi": {
        "canonical_name": "Ragi",
        "aliases": ["ragi", "finger millet"],
        "display_aliases": []
    },
    "arhar_tur": {
        "canonical_name": "Arhar / Tur",
        "aliases": ["arhar", "tur", "red gram", "arhar (tur)", "arhar/tur"],
        "display_aliases": ["Tur"]
    },
    "moong": {
        "canonical_name": "Moong",
        "aliases": ["moong", "green gram"],
        "display_aliases": []
    },
    "urad": {
        "canonical_name": "Urad",
        "aliases": ["urad", "black gram"],
        "display_aliases": []
    },
    "groundnut": {
        "canonical_name": "Groundnut",
        "aliases": ["groundnut", "peanut", "moongphali"],
        "display_aliases": ["Moongphali"]
    },
    "sunflower_seed": {
        "canonical_name": "Sunflower Seed",
        "aliases": ["sunflower", "sunflower seed", "surajmukhi"],
        "display_aliases": []
    },
    "soyabean": {
        "canonical_name": "Soyabean",
        "aliases": ["soyabean", "soybean", "soya"],
        "display_aliases": []
    },
    "sesamum": {
        "canonical_name": "Sesamum",
        "aliases": ["sesamum", "til", "sesame"],
        "display_aliases": ["Til"]
    },
    "nigerseed": {
        "canonical_name": "Nigerseed",
        "aliases": ["nigerseed", "ramtil"],
        "display_aliases": []
    },
    "cotton_medium": {
        "canonical_name": "Cotton (Medium Staple)",
        "aliases": ["cotton medium", "cotton"],
        "display_aliases": ["Kapas"]
    }
}


def normalize_crop_name(raw_name: str) -> Tuple[str, str, List[str]]:
    """
    Cleans raw crop string and resolves to canonical (crop_id, canonical_name, aliases).
    Handles multi-line names, special characters, and numbering (e.g. '1. Wheat', 'Lentil (Masur)').
    """
    if not raw_name:
        return "", "", []

    # Remove leading numbering like "1.", "1 ", "(i)", "a."
    cleaned = re.sub(r'^\s*(?:\d+[\.\)]|\([a-z0-9]+\))\s*', '', raw_name, flags=re.IGNORECASE)
    # Remove asterisks or footnotes
    cleaned = re.sub(r'[\*\#\^]', '', cleaned)
    # Normalize whitespaces and ampersands
    cleaned = " ".join(cleaned.replace('\n', ' ').split()).strip()

    lookup_key = cleaned.lower()
    # Normalize 'and' to '&' for lookup
    lookup_alt = lookup_key.replace(" and ", " & ")

    for cid, info in CANONICAL_CROPS.items():
        if lookup_key in info["aliases"] or lookup_alt in info["aliases"]:
            return cid, info["canonical_name"], info["display_aliases"]
        # Partial match if exact alias not hit (e.g., 'lentil (masur)' contains 'masur')
        for alias in info["aliases"]:
            if alias == lookup_key or alias == lookup_alt:
                return cid, info["canonical_name"], info["display_aliases"]

    # Fallback for unrecognized crops
    generated_id = re.sub(r'[^a-z0-9]+', '_', lookup_key).strip('_')
    return generated_id, cleaned, []


def parse_numeric(val: Any) -> Optional[float]:
    """Parses numeric string, stripping currency symbols, commas, %, and whitespace."""
    if val is None:
        return None
    s = str(val).strip()
    if not s or s.lower() in ("-", "--", "na", "n/a", "nil", "none"):
        return None

    # Check if negative
    is_negative = s.startswith("-")

    # Strip trailing "/-" often found in Indian rupee notation e.g. 2610/-
    s_cleaned = re.sub(r'\/[-–]*$', '', s)
    # Remove currency symbols, commas, %, letters, spaces, but keep digits, decimal and minus
    cleaned = re.sub(r'[Rs\.\,\₹\%\sA-Za-z]', '', s_cleaned)
    match = re.search(r'[-+]?\d+(?:\.\d+)?', cleaned)
    if match:
        try:
            num = float(match.group(0))
            if is_negative and num > 0:
                num = -num
            return num
        except ValueError:
            return None
    return None


def identify_columns(headers: List[str], marketing_year: str) -> Dict[str, Optional[int]]:
    """
    Identifies column indices for crop, current MSP, cost of production, and margin.
    CRITICAL: Distinguishes between previous-season MSP and current-season MSP.
    """
    col_map = {
        "crop_idx": None,
        "current_msp_idx": None,
        "cost_idx": None,
        "margin_idx": None,
        "prev_msp_idx": None
    }

    # Normalize marketing year fragments
    target_year = marketing_year.replace('–', '-').strip()
    target_suffix = target_year.split('-')[-1] if '-' in target_year else target_year

    for idx, raw_h in enumerate(headers):
        h = raw_h.lower()

        # Crop/Commodity column
        if any(k in h for k in ["crop", "commodity", "item", "name"]) and col_map["crop_idx"] is None:
            col_map["crop_idx"] = idx
            continue

        # Skip explicit "Increase in MSP" or "Absolute Increase"
        if "increase" in h or "absolute" in h:
            continue

        # Margin percentage column (must be checked BEFORE cost because headers say "Margin over cost")
        if "margin" in h:
            col_map["margin_idx"] = idx
            continue

        # Cost of production column
        if "cost" in h:
            col_map["cost_idx"] = idx
            continue

        # Check MSP columns
        if "msp" in h or "minimum support" in h:
            # Check if this column specifically refers to the target marketing year (e.g. 2027-28 or 27-28)
            if target_year in h or f"20{target_suffix}" in h or target_suffix in h:
                col_map["current_msp_idx"] = idx
            # Check if it has a previous year (e.g. 2026-27)
            elif any(yr in h for yr in ["2026-27", "2025-26", "2024-25", "2023-24", "previous"]):
                col_map["prev_msp_idx"] = idx
            else:
                # If no year is in header, store as candidate current MSP if not already set
                if col_map["current_msp_idx"] is None:
                    col_map["current_msp_idx"] = idx

    # Fallback heuristics if crop_idx is still None
    if col_map["crop_idx"] is None:
        # If column 0 is S.No, crop is column 1, else column 0
        if len(headers) > 1 and any(k in headers[0].lower() for k in ["s.no", "sl", "no", "#"]):
            col_map["crop_idx"] = 1
        else:
            col_map["crop_idx"] = 0

    # If current_msp_idx is still None, scan for column that is NOT crop, NOT cost, NOT margin
    if col_map["current_msp_idx"] is None:
        for idx in range(len(headers)):
            if idx not in [col_map["crop_idx"], col_map["cost_idx"], col_map["margin_idx"], col_map["prev_msp_idx"]]:
                col_map["current_msp_idx"] = idx
                break

    return col_map


def parse_extracted_tables(
    raw_tables: List[List[List[str]]],
    metadata: Dict[str, Any]
) -> Tuple[pd.DataFrame, List[Dict[str, Any]]]:
    """
    Processes raw tables into a normalized Pandas DataFrame conforming to:
    crop_id, crop_name, season, marketing_year, msp, unit, cost_of_production, margin_percent, published_at.
    Returns (DataFrame, validation_logs).
    """
    rows: List[Dict[str, Any]] = []
    validation_logs: List[Dict[str, Any]] = []

    season = metadata.get("season", "Rabi")
    marketing_year = metadata.get("marketing_year", "2027-28")
    published_at = metadata.get("published_at", "")
    unit = "INR/quintal"

    seen_crop_ids = set()

    for table_idx, table in enumerate(raw_tables):
        if not table or len(table) < 2:
            continue

        # Detect headers: first 1 or 2 rows
        header_row = table[0]
        data_start_idx = 1

        # Check if second row is also part of header (multi-line header)
        if len(table) > 2 and any(k in "".join(table[1]).lower() for k in ["rms", "kms", "202", "cost", "margin", "quintal"]):
            # Merge first two rows
            merged_header = []
            for col_i in range(min(len(table[0]), len(table[1]))):
                merged_header.append(f"{table[0][col_i]} {table[1][col_i]}".strip())
            header_row = merged_header
            data_start_idx = 2

        col_map = identify_columns(header_row, marketing_year)
        crop_col = col_map["crop_idx"]
        msp_col = col_map["current_msp_idx"]
        cost_col = col_map["cost_idx"]
        margin_col = col_map["margin_idx"]

        for row_idx, row in enumerate(table[data_start_idx:], start=data_start_idx):
            if not any(row):
                continue

            # Extract raw crop cell
            raw_crop = row[crop_col] if crop_col is not None and crop_col < len(row) else ""
            if not raw_crop or any(skip in raw_crop.lower() for skip in ["total", "source", "note", "average", "pib delhi", "table"]):
                continue

            crop_id, crop_name, aliases = normalize_crop_name(raw_crop)
            if not crop_id:
                continue

            # Extract numeric fields
            raw_msp = row[msp_col] if msp_col is not None and msp_col < len(row) else None
            msp_val = parse_numeric(raw_msp)

            cost_val = None
            if cost_col is not None and cost_col < len(row):
                cost_val = parse_numeric(row[cost_col])

            margin_val = None
            if margin_col is not None and margin_col < len(row):
                margin_val = parse_numeric(row[margin_col])

            # Validation checks
            row_errors: List[str] = []
            row_warnings: List[str] = []

            if crop_id in seen_crop_ids:
                row_errors.append(f"Duplicate crop detected in same document: '{crop_name}'")
            else:
                seen_crop_ids.add(crop_id)

            if msp_val is None:
                row_errors.append("MSP amount is missing or invalid")
            elif msp_val <= 0:
                row_errors.append(f"MSP must be positive, found: {msp_val}")

            if not season:
                row_errors.append("Season is missing")
            if not marketing_year:
                row_errors.append("Marketing year is missing")

            if cost_val is None:
                row_warnings.append("Cost of production not detected")
            if margin_val is None:
                row_warnings.append("Margin percentage not detected")

            validation_status = "error" if row_errors else ("warning" if row_warnings else "valid")
            validation_logs.append({
                "table_index": table_idx,
                "row_index": row_idx,
                "crop_name": crop_name,
                "status": validation_status,
                "errors": row_errors,
                "warnings": row_warnings
            })

            rows.append({
                "crop_id": crop_id,
                "crop_name": crop_name,
                "crop_aliases": aliases,
                "season": season,
                "marketing_year": marketing_year,
                "msp": msp_val,
                "unit": unit,
                "cost_of_production": cost_val,
                "margin_percent": margin_val,
                "published_at": published_at,
                "validation_status": validation_status
            })

    # Columns required by specification
    expected_cols = [
        "crop_id", "crop_name", "season", "marketing_year",
        "msp", "unit", "cost_of_production", "margin_percent",
        "published_at"
    ]

    if not rows:
        df = pd.DataFrame(columns=expected_cols)
    else:
        df = pd.DataFrame(rows)
        # Retain aliases and validation_status in dataframe for review UI
        cols_to_keep = [c for c in expected_cols if c in df.columns]
        if "crop_aliases" in df.columns:
            cols_to_keep.append("crop_aliases")
        if "validation_status" in df.columns:
            cols_to_keep.append("validation_status")
        df = df[cols_to_keep]

    return df, validation_logs

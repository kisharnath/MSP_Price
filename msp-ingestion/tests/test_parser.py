"""
Unit tests for PDF extraction and MSP parsing modules.
Tests:
- PDF text and metadata extraction
- Table extraction and multi-line crop names
- Numeric parsing (removing Rs, commas, etc.)
- Publication datetime and ISO 8601 timezone handling
- Missing/invalid MSP validation
- Duplicate crop detection in same notification
- Full pipeline test with official Rabi 2027-28 sample PDF
"""

import os
from datetime import datetime, timezone, timedelta
import pytest
import pandas as pd

from pdf_extractor import (
    extract_pdf_data,
    calculate_pdf_hash,
    parse_publication_datetime,
    extract_document_metadata,
    ScannedPDFError,
    IST
)
from msp_parser import (
    normalize_crop_name,
    parse_numeric,
    identify_columns,
    parse_extracted_tables
)


def test_normalize_crop_name():
    # Multi-line and standard names
    cid, name, aliases = normalize_crop_name("Wheat")
    assert cid == "wheat"
    assert name == "Wheat"
    assert "Gehu" in aliases

    # Multi-line Lentil
    cid, name, aliases = normalize_crop_name("Lentil\n(Masur)")
    assert cid == "lentil_masur"
    assert name == "Lentil (Masur)"
    assert "Masur" in aliases

    # Rapeseed with ampersand & line break
    cid, name, aliases = normalize_crop_name("Rapeseed &\nMustard")
    assert cid == "rapeseed_mustard"
    assert name == "Rapeseed & Mustard"

    # Numbered prefix
    cid, name, _ = normalize_crop_name("1. Barley")
    assert cid == "barley"
    assert name == "Barley"

    # Alias Gehu
    cid, name, _ = normalize_crop_name("Gehu")
    assert cid == "wheat"
    assert name == "Wheat"


def test_parse_numeric():
    assert parse_numeric("2610") == 2610.0
    assert parse_numeric("Rs. 2,610/-") == 2610.0
    assert parse_numeric("1,264") == 1264.0
    assert parse_numeric("106%") == 106.0
    assert parse_numeric("-") is None
    assert parse_numeric("N/A") is None
    assert parse_numeric(None) is None


def test_parse_publication_datetime():
    pib_text = "Posted On: 30 SEP 2026 3:19PM by PIB Delhi"
    dt = parse_publication_datetime(pib_text)
    assert dt.year == 2026
    assert dt.month == 9
    assert dt.day == 30
    assert dt.hour == 15
    assert dt.minute == 19
    assert dt.tzinfo is not None
    # Check IST offset (+05:30)
    assert dt.utcoffset() == timedelta(hours=5, minutes=30)

    # Date only fallback
    date_text = "Date of Release: 15 October 2026"
    dt2 = parse_publication_datetime(date_text)
    assert dt2.year == 2026
    assert dt2.month == 10
    assert dt2.day == 15
    assert dt2.hour == 0


def test_identify_columns_ignores_previous_season():
    headers = [
        "Crops",
        "MSP RMS 2026-27 (Rs./quintal)",
        "Cost* of production RMS 2027-28",
        "MSP RMS 2027-28 (Rs./quintal)",
        "Increase in MSP (Absolute)",
        "Margin over cost (in %)"
    ]
    col_map = identify_columns(headers, marketing_year="2027-28")
    assert col_map["crop_idx"] == 0
    assert col_map["prev_msp_idx"] == 1
    assert col_map["cost_idx"] == 2
    assert col_map["current_msp_idx"] == 3
    assert col_map["margin_idx"] == 5


def test_missing_and_invalid_msp_validation():
    # Table with missing MSP and negative MSP
    raw_tables = [[
        ["Crops", "Cost", "MSP RMS 2027-28", "Margin"],
        ["Wheat", "1200", "", "50%"],          # Missing MSP
        ["Barley", "1100", "-500", "40%"],      # Negative MSP
        ["Gram", "3000", "5958", "60%"],        # Valid
    ]]
    metadata = {
        "season": "Rabi",
        "marketing_year": "2027-28",
        "published_at": "2026-09-30T15:19:00+05:30"
    }

    df, logs = parse_extracted_tables(raw_tables, metadata)
    assert len(df) == 3
    # Check errors for row 0 and 1
    assert logs[0]["status"] == "error"
    assert any("missing or invalid" in e for e in logs[0]["errors"])

    assert logs[1]["status"] == "error"
    assert any("positive" in e for e in logs[1]["errors"])

    assert logs[2]["status"] == "valid"


def test_duplicate_crop_prevention_in_same_document():
    # Table containing duplicate crop entry
    raw_tables = [[
        ["Crops", "Cost", "MSP RMS 2027-28", "Margin"],
        ["Wheat", "1200", "2610", "100%"],
        ["Gehu", "1200", "2610", "100%"], # Alias for Wheat
    ]]
    metadata = {
        "season": "Rabi",
        "marketing_year": "2027-28",
        "published_at": "2026-09-30T15:19:00+05:30"
    }
    df, logs = parse_extracted_tables(raw_tables, metadata)
    assert logs[1]["status"] == "error"
    assert any("Duplicate crop detected" in e for e in logs[1]["errors"])


def test_scanned_pdf_error(tmp_path):
    """Verifies that empty or scanned PDFs raise ScannedPDFError instead of returning empty datasets."""
    from reportlab.pdfgen import canvas
    empty_pdf_path = str(tmp_path / "scanned_or_empty.pdf")
    c = canvas.Canvas(empty_pdf_path)
    # Draw blank page with no text or tables
    c.showPage()
    c.save()

    with pytest.raises(ScannedPDFError) as exc_info:
        extract_pdf_data(empty_pdf_path)
    assert "OCR is required" in str(exc_info.value)


def test_rabi_2027_28_sample_pdf_extraction():
    """Validates the official test PDF fixture with 6 crops."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pdf_path = os.path.join(base_dir, "MSP for Rabi Crops for Marketing Season 2027-28.pdf")

    assert os.path.exists(pdf_path), f"Sample PDF not found at {pdf_path}"

    data = extract_pdf_data(pdf_path)
    metadata = data["metadata"]

    assert metadata["season"] == "Rabi"
    assert metadata["marketing_year"] == "2027-28"
    assert "2026-09-30T15:19:00" in metadata["published_at"]
    assert metadata["content_hash"] is not None

    df, logs = parse_extracted_tables(data["raw_tables"], metadata)

    # Must extract exactly 6 crops
    assert len(df) == 6

    expected_values = {
        "wheat": 2610.0,
        "barley": 2286.0,
        "gram": 5958.0,
        "lentil_masur": 7390.0,
        "rapeseed_mustard": 6613.0,
        "safflower": 7215.0
    }

    for _, row in df.iterrows():
        cid = row["crop_id"]
        assert cid in expected_values, f"Unexpected crop_id: {cid}"
        assert row["msp"] == expected_values[cid], f"MSP mismatch for {cid}: expected {expected_values[cid]}, got {row['msp']}"
        assert row["season"] == "Rabi"
        assert row["marketing_year"] == "2027-28"
        assert row["validation_status"] == "valid"

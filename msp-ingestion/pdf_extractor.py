"""
PDF extraction module using pdfplumber.
Extracts text, table data, and metadata from official Government of India MSP notifications.
"""

import hashlib
import re
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple
import pdfplumber

logger = logging.getLogger(__name__)

# Indian Standard Time (+05:30)
IST = timezone(timedelta(hours=5, minutes=30))


class ScannedPDFError(Exception):
    """Raised when PDF contains no extractable text or tables (scanned document requiring OCR)."""
    pass


def calculate_pdf_hash(file_path: str) -> str:
    """Calculates SHA-256 hash of the given PDF file."""
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def parse_publication_datetime(text: str) -> datetime:
    """
    Extracts publication date and time from document text.
    Government PIB notifications typically include:
    'Posted On: 30 SEP 2026 3:19PM by PIB Delhi'
    '30-09-2026 15:19' or '30 September 2026'
    Returns an ISO timezone-aware datetime (defaulting to IST +05:30).
    """
    # 1. Check for standard PIB format: e.g., '30 SEP 2026 3:19PM' or '30 OCT 2026 11:00 AM'
    pib_match = re.search(
        r'(?:Posted\s+On[:\s]+)?(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*([APap][Mm])?',
        text,
        re.IGNORECASE
    )
    if pib_match:
        day = int(pib_match.group(1))
        month_str = pib_match.group(2)[:3].capitalize()
        year = int(pib_match.group(3))
        hour = int(pib_match.group(4))
        minute = int(pib_match.group(5))
        ampm = pib_match.group(6)

        if ampm:
            ampm = ampm.upper()
            if ampm == "PM" and hour < 12:
                hour += 12
            elif ampm == "AM" and hour == 12:
                hour = 0

        month_map = {
            "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
            "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12
        }
        month = month_map.get(month_str, 9)
        return datetime(year, month, day, hour, minute, 0, tzinfo=IST)

    # 2. Check for ISO date format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS
    iso_match = re.search(r'(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?', text)
    if iso_match:
        y, m, d = int(iso_match.group(1)), int(iso_match.group(2)), int(iso_match.group(3))
        hh = int(iso_match.group(4)) if iso_match.group(4) else 0
        mm = int(iso_match.group(5)) if iso_match.group(5) else 0
        ss = int(iso_match.group(6)) if iso_match.group(6) else 0
        return datetime(y, m, d, hh, mm, ss, tzinfo=IST)

    # 3. Fallback date without explicit time: midnight with IST
    date_only_match = re.search(r'(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})', text)
    if date_only_match:
        day = int(date_only_match.group(1))
        month_str = date_only_match.group(2)[:3].capitalize()
        year = int(date_only_match.group(3))
        month_map = {
            "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
            "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12
        }
        month = month_map.get(month_str, 1)
        return datetime(year, month, day, 0, 0, 0, tzinfo=IST)

    # Default to current time in IST
    return datetime.now(IST)


def extract_document_metadata(full_text: str, file_name: str) -> Dict[str, Any]:
    """Extracts high-level notification metadata from document text."""
    # Detect Season
    season = "Rabi"
    if re.search(r'\bKharif\b', full_text, re.IGNORECASE):
        season = "Kharif"
    elif re.search(r'\bZaid\b|\bSummer\b', full_text, re.IGNORECASE):
        season = "Zaid"
    elif re.search(r'\bRabi\b', full_text, re.IGNORECASE):
        season = "Rabi"

    # Detect Marketing Year: e.g. 2027-28, 2026-27, 2025-26
    year_match = re.search(r'(?:Marketing\s+Season|RMS|KMS|Season)?\s*(\d{4}[-–]\d{2,4})', full_text, re.IGNORECASE)
    marketing_year = "2027-28"
    if year_match:
        raw_year = year_match.group(1).replace('–', '-')
        # Normalize 2027-2028 to 2027-28
        parts = raw_year.split('-')
        if len(parts) == 2 and len(parts[1]) == 4:
            marketing_year = f"{parts[0]}-{parts[1][-2:]}"
        else:
            marketing_year = raw_year

    # Detect Title
    title = f"MSP for {season} Crops for Marketing Season {marketing_year}"
    title_match = re.search(r'(Cabinet\s+approves.*?(?:Rabi|Kharif).*?Season\s*\d{4}[-–]\d{2,4})', full_text, re.IGNORECASE | re.DOTALL)
    if title_match:
        clean_t = " ".join(title_match.group(1).split())
        if len(clean_t) < 150:
            title = clean_t

    # Published Datetime
    pub_dt = parse_publication_datetime(full_text)

    # Document ID
    clean_season = season.upper()
    clean_year = marketing_year.replace('-', '_')
    doc_id = f"PIB_{clean_season}_{clean_year}"

    return {
        "_id": doc_id,
        "title": title,
        "source_name": "Press Information Bureau",
        "source_url": "https://www.pib.gov.in",
        "file_name": file_name,
        "season": season,
        "marketing_year": marketing_year,
        "published_at": pub_dt.isoformat(),
        "verification_status": "pending",
        "extraction_method": "pdfplumber"
    }


def clean_cell(cell: Any) -> str:
    """Cleans a table cell value, removing linebreaks and excess spaces."""
    if cell is None:
        return ""
    text = str(cell).replace('\r', ' ').replace('\n', ' ')
    return " ".join(text.split()).strip()


def extract_pdf_data(file_path: str) -> Dict[str, Any]:
    """
    Extracts text, table candidates, and metadata from a PDF file using pdfplumber.
    Raises ScannedPDFError if no text or tables could be extracted.
    """
    content_hash = calculate_pdf_hash(file_path)
    file_name = file_path.split("/")[-1].split("\\")[-1]

    all_text_pages: List[str] = []
    all_raw_tables: List[List[List[str]]] = []

    try:
        with pdfplumber.open(file_path) as pdf:
            if len(pdf.pages) == 0:
                raise ScannedPDFError("PDF has 0 pages.")

            for i, page in enumerate(pdf.pages):
                page_text = page.extract_text() or ""
                if page_text.strip():
                    all_text_pages.append(page_text)

                # Extract tables with default and line-based strategies
                tables = page.extract_tables()
                if not tables:
                    # Try alternative table extraction settings
                    tables = page.extract_tables({
                        "vertical_strategy": "text",
                        "horizontal_strategy": "lines",
                        "snap_tolerance": 5
                    }) or []

                for table in tables:
                    if table and len(table) > 1:
                        # Clean each row
                        cleaned_table = []
                        for row in table:
                            cleaned_row = [clean_cell(cell) for cell in row]
                            # Only include non-empty rows
                            if any(cleaned_row):
                                cleaned_table.append(cleaned_row)
                        if len(cleaned_table) > 1:
                            all_raw_tables.append(cleaned_table)

    except ScannedPDFError:
        raise
    except Exception as e:
        logger.error(f"Error reading PDF {file_path}: {e}")
        raise ValueError(f"Failed to read PDF file: {str(e)}")

    full_text = "\n\n".join(all_text_pages)

    # Check if PDF is scanned or devoid of text
    if not full_text.strip() and not all_raw_tables:
        raise ScannedPDFError(
            "This PDF appears to be scanned or contains no extractable text. OCR is required before ingestion."
        )

    # Extract metadata
    metadata = extract_document_metadata(full_text, file_name)
    metadata["content_hash"] = content_hash

    return {
        "metadata": metadata,
        "full_text": full_text,
        "raw_tables": all_raw_tables,
        "content_hash": content_hash
    }

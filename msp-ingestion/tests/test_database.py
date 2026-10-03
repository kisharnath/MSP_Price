"""
Unit tests for database module:
Tests:
- MongoDB index initialization
- Duplicate PDF hash detection
- Approved document saving with BSON Date published_at
- Rejection of unverified records (ensuring they are not queryable)
- Historical season preservation across multiple years
- Latest verified MSP retrieval by published_at sorting
- Retrieval of MSP by specific marketing year
"""

import os
from datetime import datetime, timezone, timedelta
import pytest
import mongomock

from database import (
    get_database,
    check_duplicate_document,
    save_approved_document,
    save_rejected_document,
    get_latest_msp,
    get_msp_by_year,
    get_historical_records,
    list_documents,
    list_records
)

IST = timezone(timedelta(hours=5, minutes=30))


@pytest.fixture
def mock_db():
    """Provides a fresh isolated in-memory mongomock database for each test."""
    client = mongomock.MongoClient()
    db = client["test_agriculture_db"]
    from database import init_indexes
    init_indexes(db)
    return db


def test_duplicate_pdf_detection(mock_db):
    doc_hash = "abc123hash456"
    assert check_duplicate_document(doc_hash, db=mock_db) is None

    # Save a document
    doc_data = {
        "_id": "DOC_1",
        "title": "MSP Notification 1",
        "content_hash": doc_hash,
        "season": "Rabi",
        "marketing_year": "2027-28"
    }
    save_approved_document(doc_data, [], db=mock_db)

    # Now should detect duplicate
    existing = check_duplicate_document(doc_hash, db=mock_db)
    assert existing is not None
    assert existing["_id"] == "DOC_1"


def test_approval_and_rejection_workflows(mock_db):
    # Test rejection
    rej_doc = {
        "_id": "REJECTED_DOC",
        "title": "Invalid Notification",
        "content_hash": "rej_hash",
        "season": "Rabi",
        "marketing_year": "2027-28"
    }
    success, msg = save_rejected_document(rej_doc, reason="Corrupt numbers in table", db=mock_db)
    assert success is True

    stored_rej = mock_db["msp_documents"].find_one({"_id": "REJECTED_DOC"})
    assert stored_rej["verification_status"] == "rejected"
    assert stored_rej["rejection_reason"] == "Corrupt numbers in table"

    # Verify no records exposed
    latest = get_latest_msp("wheat", "Rabi", db=mock_db)
    assert latest is None


def test_historical_preservation_and_latest_msp(mock_db):
    """
    Simulates uploading two seasons:
    1. Rabi 2026-27 (published 2025-10-01)
    2. Rabi 2027-28 (published 2026-09-30)
    Ensures both seasons are preserved in MongoDB, and get_latest_msp correctly returns the newest.
    """
    time_2026 = datetime(2025, 10, 1, 14, 0, 0, tzinfo=IST)
    time_2027 = datetime(2026, 9, 30, 15, 19, 0, tzinfo=IST)

    doc_2026 = {
        "_id": "PIB_RABI_2026_27",
        "title": "MSP for Rabi Crops 2026-27",
        "content_hash": "hash_2026",
        "season": "Rabi",
        "marketing_year": "2026-27",
        "published_at": time_2026
    }
    records_2026 = [{
        "crop_id": "wheat",
        "crop_name": "Wheat",
        "season": "Rabi",
        "marketing_year": "2026-27",
        "msp": 2425.0,
        "unit": "INR/quintal",
        "published_at": time_2026
    }]

    # Save 2026-27
    save_approved_document(doc_2026, records_2026, db=mock_db)

    # Check 2026 latest
    latest = get_latest_msp("wheat", "Rabi", db=mock_db)
    assert latest is not None
    assert latest["marketing_year"] == "2026-27"
    assert latest["msp"] == 2425.0

    # Save 2027-28
    doc_2027 = {
        "_id": "PIB_RABI_2027_28",
        "title": "MSP for Rabi Crops 2027-28",
        "content_hash": "hash_2027",
        "season": "Rabi",
        "marketing_year": "2027-28",
        "published_at": time_2027
    }
    records_2027 = [{
        "crop_id": "wheat",
        "crop_name": "Wheat",
        "season": "Rabi",
        "marketing_year": "2027-28",
        "msp": 2610.0,
        "unit": "INR/quintal",
        "published_at": time_2027
    }]
    save_approved_document(doc_2027, records_2027, db=mock_db)

    # 1. Historical preservation: 2026-27 MUST still exist!
    wheat_2026 = get_msp_by_year("wheat", "Rabi", "2026-27", db=mock_db)
    assert wheat_2026 is not None
    assert wheat_2026["msp"] == 2425.0

    # 2. Latest query must return 2027-28 (latest published_at)
    latest_now = get_latest_msp("wheat", "Rabi", db=mock_db)
    assert latest_now is not None
    assert latest_now["marketing_year"] == "2027-28"
    assert latest_now["msp"] == 2610.0

    # 3. Total historical records for wheat in Rabi must be 2
    history = get_historical_records("wheat", "Rabi", db=mock_db)
    assert len(history) == 2


def test_unverified_records_never_returned(mock_db):
    """Ensures records not approved (or unverified) are never returned in public queries."""
    rec = {
        "_id": "PENDING_REC",
        "document_id": "PENDING_DOC",
        "crop_id": "barley",
        "season": "Rabi",
        "marketing_year": "2027-28",
        "msp": 2286.0,
        "verification_status": "pending",
        "published_at": datetime.now(timezone.utc)
    }
    mock_db["msp_records"].insert_one(rec)

    # get_latest_msp must filter for verification_status == 'verified'
    res = get_latest_msp("barley", "Rabi", db=mock_db)
    assert res is None

    res_year = get_msp_by_year("barley", "Rabi", "2027-28", db=mock_db)
    assert res_year is None

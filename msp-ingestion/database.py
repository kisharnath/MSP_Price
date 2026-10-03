"""
MongoDB database connection, index creation, and data access methods.
Supports both live MongoDB instances (local/Atlas) and mongomock fallback for testing.
"""

import os
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
from dotenv import load_dotenv
import pymongo
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, DuplicateKeyError

# Load environment configuration
load_dotenv()

logger = logging.getLogger(__name__)

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "agriculture_db")

_client = None
_db = None
_is_mock = False


def get_database(uri: Optional[str] = None, db_name: Optional[str] = None, force_mock: bool = False):
    """
    Returns the database instance. Tries to connect to MongoDB URI.
    If unreachable or force_mock=True, falls back to mongomock.
    """
    global _client, _db, _is_mock

    target_uri = uri or MONGODB_URI
    target_db_name = db_name or MONGODB_DATABASE

    if force_mock:
        import mongomock
        _client = mongomock.MongoClient()
        _db = _client[target_db_name]
        _is_mock = True
        logger.info("Using mongomock in-memory database as requested.")
        init_indexes(_db)
        return _db

    try:
        client = MongoClient(target_uri, serverSelectionTimeoutMS=2000)
        # Verify server connection
        client.admin.command('ping')
        _client = client
        _db = _client[target_db_name]
        _is_mock = False
        logger.info(f"Successfully connected to MongoDB at {target_uri}")
    except (ConnectionFailure, Exception) as e:
        logger.warning(f"Could not connect to live MongoDB at {target_uri}: {e}. Falling back to mongomock.")
        import mongomock
        _client = mongomock.MongoClient()
        _db = _client[target_db_name]
        _is_mock = True

    init_indexes(_db)
    return _db


def init_indexes(db):
    """Initializes required MongoDB indexes on msp_documents and msp_records."""
    msp_documents = db["msp_documents"]
    msp_records = db["msp_records"]

    try:
        # Index on content_hash to prevent duplicate document uploads
        msp_documents.create_index(
            [("content_hash", 1)],
            unique=True
        )

        # Unique compound index to prevent duplicate crops within same document
        msp_records.create_index(
            [("document_id", 1), ("crop_id", 1)],
            unique=True
        )

        # Compound index for latest verified MSP queries
        msp_records.create_index([
            ("crop_id", 1),
            ("season", 1),
            ("verification_status", 1),
            ("published_at", -1)
        ])

        # Compound index for marketing year lookups
        msp_records.create_index([
            ("crop_id", 1),
            ("season", 1),
            ("marketing_year", 1)
        ])
    except Exception as e:
        logger.error(f"Error creating indexes: {e}")


def is_database_mock() -> bool:
    """Returns whether the active DB connection is an in-memory mock."""
    global _is_mock
    return _is_mock


def check_duplicate_document(content_hash: str, db=None) -> Optional[Dict[str, Any]]:
    """Checks if a document with this content_hash already exists."""
    database = db if db is not None else get_database()
    return database["msp_documents"].find_one({"content_hash": content_hash})


def save_approved_document(doc_data: Dict[str, Any], record_list: List[Dict[str, Any]], db=None) -> Tuple[bool, str, int]:
    """
    Saves or updates an approved MSP document and its associated crop records.
    Sets verification_status to 'verified'.
    """
    database = db if db is not None else get_database()
    doc_col = database["msp_documents"]
    rec_col = database["msp_records"]

    doc_id = doc_data.get("_id")
    if not doc_id:
        return False, "Document data missing '_id'", 0

    # Ensure document status is verified
    doc_payload = dict(doc_data)
    doc_payload["verification_status"] = "verified"
    doc_payload["record_count"] = len(record_list)
    if "uploaded_at" not in doc_payload:
        doc_payload["uploaded_at"] = datetime.now(timezone.utc)

    # Upsert document
    doc_col.update_one({"_id": doc_id}, {"$set": doc_payload}, upsert=True)

    records_saved = 0
    for rec in record_list:
        rec_payload = dict(rec)
        crop_id = rec_payload.get("crop_id")
        rec_payload["document_id"] = doc_id
        rec_payload["verification_status"] = "verified"
        if not rec_payload.get("_id"):
            rec_payload["_id"] = f"{doc_id}_{crop_id.upper()}"

        # Ensure published_at is BSON datetime
        if isinstance(rec_payload.get("published_at"), str):
            try:
                rec_payload["published_at"] = datetime.fromisoformat(rec_payload["published_at"])
            except Exception:
                pass

        rec_col.update_one(
            {"document_id": doc_id, "crop_id": crop_id},
            {"$set": rec_payload},
            upsert=True
        )
        records_saved += 1

    return True, f"Document '{doc_id}' and {records_saved} crop records successfully verified and saved.", records_saved


def save_rejected_document(doc_data: Dict[str, Any], reason: str = "", db=None) -> Tuple[bool, str]:
    """
    Saves document audit metadata with status 'rejected'.
    Does NOT write or expose crop records into the verified query pool.
    """
    database = db if db is not None else get_database()
    doc_col = database["msp_documents"]

    doc_id = doc_data.get("_id")
    if not doc_id:
        return False, "Document data missing '_id'"

    doc_payload = dict(doc_data)
    doc_payload["verification_status"] = "rejected"
    doc_payload["rejection_reason"] = reason
    doc_payload["rejected_at"] = datetime.now(timezone.utc)

    doc_col.update_one({"_id": doc_id}, {"$set": doc_payload}, upsert=True)
    return True, f"Document '{doc_id}' has been marked as rejected."


def get_latest_msp(crop_id: str, season: str, db=None) -> Optional[Dict[str, Any]]:
    """
    Retrieves the latest verified MSP record for a crop and season,
    sorting chronologically by published_at (BSON Date) descending.
    """
    database = db if db is not None else get_database()
    msp_records = database["msp_records"]
    return msp_records.find_one(
        {
            "crop_id": crop_id.lower().strip(),
            "season": season.strip().capitalize(),
            "verification_status": "verified"
        },
        sort=[
            ("published_at", -1),
            ("_id", -1)
        ]
    )


def get_msp_by_year(crop_id: str, season: str, marketing_year: str, db=None) -> Optional[Dict[str, Any]]:
    """
    Retrieves the verified MSP record for a specific crop, season, and marketing year.
    """
    database = db if db is not None else get_database()
    msp_records = database["msp_records"]
    return msp_records.find_one(
        {
            "crop_id": crop_id.lower().strip(),
            "season": season.strip().capitalize(),
            "marketing_year": marketing_year.strip(),
            "verification_status": "verified"
        },
        sort=[
            ("published_at", -1),
            ("_id", -1)
        ]
    )


def get_historical_records(crop_id: Optional[str] = None, season: Optional[str] = None, db=None) -> List[Dict[str, Any]]:
    """
    Retrieves historical verified MSP records sorted chronologically.
    """
    database = db if db is not None else get_database()
    query: Dict[str, Any] = {"verification_status": "verified"}
    if crop_id:
        query["crop_id"] = crop_id.lower().strip()
    if season:
        query["season"] = season.strip().capitalize()

    return list(database["msp_records"].find(query).sort([("published_at", -1), ("marketing_year", -1)]))


def list_documents(db=None) -> List[Dict[str, Any]]:
    """Lists all stored documents."""
    database = db if db is not None else get_database()
    return list(database["msp_documents"].find().sort("published_at", -1))


def list_records(crop_id: Optional[str] = None, season: Optional[str] = None,
                 marketing_year: Optional[str] = None, status: Optional[str] = None, db=None) -> List[Dict[str, Any]]:
    """Filters stored MSP records by various criteria."""
    database = db if db is not None else get_database()
    query: Dict[str, Any] = {}
    if crop_id:
        query["crop_id"] = crop_id.lower().strip()
    if season:
        query["season"] = season.strip().capitalize()
    if marketing_year:
        query["marketing_year"] = marketing_year.strip()
    if status:
        query["verification_status"] = status.lower().strip()

    return list(database["msp_records"].find(query).sort([("published_at", -1), ("marketing_year", -1)]))

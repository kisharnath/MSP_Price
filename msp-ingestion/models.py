"""
Pydantic data models for MSP Ingestion System.
Defines schemas for MSP documents and crop records with verification statuses.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


class VerificationStatus(str, Enum):
    pending = "pending"
    verified = "verified"
    rejected = "rejected"


class MSPDocument(BaseModel):
    """Metadata model for uploaded official MSP notification documents."""
    id: str = Field(..., alias="_id", description="Unique Document identifier, e.g. PIB_RABI_2027_28")
    title: str = Field(..., description="Official title of the document")
    source_name: str = Field(default="Press Information Bureau", description="Government agency or source")
    source_url: Optional[str] = Field(default=None, description="Optional official URL")
    file_name: str = Field(..., description="Original filename of the PDF")
    season: str = Field(..., description="Agricultural season, e.g. Rabi, Kharif")
    marketing_year: str = Field(..., description="Marketing year, e.g. 2027-28")
    published_at: datetime = Field(..., description="Publication timestamp with timezone")
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Upload timestamp")
    verification_status: VerificationStatus = Field(default=VerificationStatus.pending, description="Status of document")
    extraction_method: str = Field(default="pdfplumber", description="Extraction tool")
    content_hash: str = Field(..., description="SHA-256 hash of PDF file")
    record_count: int = Field(default=0, description="Number of crop records extracted")

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True
    }


class MSPRecord(BaseModel):
    """Model representing an individual crop's Minimum Support Price for a specific season."""
    id: str = Field(..., alias="_id", description="Unique Record identifier, e.g. PIB_RABI_2027_28_WHEAT")
    document_id: str = Field(..., description="Associated document ID")
    crop_id: str = Field(..., description="Canonical crop slug, e.g. wheat, barley, gram")
    crop_name: str = Field(..., description="Normalized crop name, e.g. Wheat, Barley")
    crop_aliases: List[str] = Field(default_factory=list, description="Common aliases and local names")
    season: str = Field(..., description="Agricultural season: Rabi, Kharif, Zaid")
    marketing_year: str = Field(..., description="Marketing year string, e.g. 2027-28")
    msp: float = Field(..., description="Minimum Support Price amount (must be positive)")
    unit: str = Field(default="INR/quintal", description="Unit of measurement")
    cost_of_production: Optional[float] = Field(default=None, description="Estimated cost of production (A2+FL)")
    margin_percent: Optional[float] = Field(default=None, description="Percentage margin over cost of production")
    published_at: datetime = Field(..., description="Notification publication timestamp")
    verification_status: VerificationStatus = Field(default=VerificationStatus.pending, description="Verification status")
    source_url: Optional[str] = Field(default=None, description="Source URL reference")
    created_at: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc), description="Creation timestamp")

    @field_validator("msp")
    @classmethod
    def validate_positive_msp(cls, v: float) -> float:
        if v <= 0:
            raise ValueError(f"MSP must be a positive number, got {v}")
        return round(float(v), 2)

    @field_validator("crop_id")
    @classmethod
    def validate_crop_id(cls, v: str) -> str:
        clean = v.strip().lower()
        if not clean:
            raise ValueError("crop_id cannot be empty")
        return clean

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True
    }

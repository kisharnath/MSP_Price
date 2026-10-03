# MSP PDF Ingestion and MongoDB Management System

A production-grade Python application built with **Gradio, pdfplumber, Pandas, and PyMongo** to extract official Government of India Minimum Support Price (MSP) notification PDFs and store verified records into MongoDB.

The system is designed for agricultural data administrators to upload notification PDFs, inspect extracted candidate records, validate numerical constraints, and approve or reject data before it is made queryable by chatbots or downstream services.

---

## 1. Features

- **Robust PDF Extraction (`pdfplumber`)**:
  - Extracts full text, headers, and multi-page tabular data from official Press Information Bureau (PIB) releases.
  - Automatically identifies document metadata: Title, Source Agency, Marketing Season, Marketing Year (e.g. `2027-28`), and Publication Date/Time.
  - Handles multi-line crop names such as `Lentil (Masur)` and `Rapeseed & Mustard`.
  - Discards previous-season MSP columns (e.g. `RMS 2026-27`) so they are never mistakenly ingested as current MSP.
  - Distinguishes between "Margin over Cost" and "Cost of production".
  - Detects scanned or unextractable PDFs and displays a clear error indicating OCR is required.

- **Data Normalization & Validation (`pandas`, `pydantic`)**:
  - Resolves local crop names and Hindi aliases (e.g. `Gehu` -> `Wheat`, `Masur` -> `Lentil (Masur)`, `Sarson` -> `Rapeseed & Mustard`, `Chana` -> `Gram`).
  - Cleans numeric formats (removes currency symbols `Rs.`, `₹`, commas, `/-`, and percentages).
  - Validates that MSP amounts are positive numbers.
  - Flags duplicate crops within the same notification.
  - Flags missing required fields and warnings for missing cost/margin values.

- **MongoDB Design & Persistence (`pymongo`)**:
  - Database: `agriculture_db`.
  - Two dedicated collections:
    - `msp_documents`: Metadata and verification audit logs.
    - `msp_records`: Granular crop-level records.
  - Unique index on `content_hash` to prevent duplicate PDF ingestion.
  - Unique compound index on `(document_id, crop_id)`.
  - Chronological index on `(crop_id, season, verification_status, published_at DESC)` for high-performance chatbot queries.
  - Timestamps stored as timezone-aware BSON Date objects (IST `+05:30` / UTC) for reliable chronological ordering.
  - Historical seasons preserved across years (uploading `2027-28` does not overwrite `2026-27`).
  - Strict verification gate: Unapproved or rejected records are never exposed to public queries.
  - Seamless fallback to `mongomock` in-memory store if no live MongoDB daemon is running.

- **Interactive Admin UI (`gradio`)**:
  - Section A: PDF upload with one-click official sample loader.
  - Section B: Document metadata editor with ISO-8601 publication timestamp normalizer.
  - Section C: Editable preview table for administrator verification and correction.
  - Section D: Action controls (`Validate Data`, `Approve and Save`, `Reject Document`, `Reset`).
  - Section E: Database Explorer (Browse Documents, Filter Records, and Chatbot Query Simulator).

---

## 2. Directory Structure

```text
msp-ingestion/
├── app.py                     # Gradio interface & controller
├── pdf_extractor.py           # pdfplumber extraction & metadata parser
├── msp_parser.py              # Normalization, alias mapping & validation
├── database.py                # MongoDB schemas, indexes & queries
├── models.py                  # Pydantic data schemas
├── requirements.txt           # Python package dependencies
├── .env.example               # Environment variables template
├── .gitignore                 # Excluded files
├── README.md                  # System documentation
├── generate_sample_pdf.py     # Script to generate PIB sample PDF fixture
├── MSP for Rabi Crops for Marketing Season 2027-28.pdf # Test fixture PDF
└── tests/
    ├── test_parser.py         # Unit tests for extractor & parser
    └── test_database.py       # Unit tests for database queries & indexes
```

---

## 3. Installation & Setup

### Step 1: Create a Virtual Environment

```bash
cd msp-ingestion
python3 -m venv venv
source venv/bin/activate
```

### Step 2: Install Dependencies

```bash
pip install -r requirements.txt
```

### Step 3: Configure Environment Variables

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Default configuration:

```env
MONGODB_URI=mongodb://localhost:27017/
MONGODB_DATABASE=agriculture_db
GRADIO_SERVER_NAME=127.0.0.1
GRADIO_SERVER_PORT=7860
```

> **Note on MongoDB**: If you have a local MongoDB daemon or MongoDB Atlas cluster, specify its connection string in `MONGODB_URI`. If no MongoDB server is available, the system automatically falls back to an in-memory `mongomock` database for testing.

---

## 4. Running the Application

Launch the Gradio administrative interface:

```bash
python3 app.py
```

The application will start on `http://127.0.0.1:7860`.

---

## 5. Running the Test Suite

Run unit tests with `pytest`:

```bash
PYTHONPATH=. pytest tests/ -v
```

All 12 unit tests verify:
- Extraction of the sample Rabi 2027-28 PDF matching expected values.
- Multi-line crop names handling (`Lentil (Masur)`, `Rapeseed & Mustard`).
- Rejection of invalid and negative MSP values.
- Detection of duplicate crops in the same notification.
- Detection of duplicate PDFs via SHA-256 hash.
- Prevention of unverified records leaking into chatbot queries.
- Correct BSON Date sorting in `get_latest_msp()`.
- Error handling for scanned/blank PDFs (`ScannedPDFError`).

---

## 6. How to Ingest and Approve an MSP Notification

1. Open the Gradio UI at `http://127.0.0.1:7860`.
2. Under **Section A: Upload Government PDF**, click **Load Official Sample PDF (Rabi 2027-28)** or upload your own notification PDF.
3. Click **🔍 Extract Text & Tables**.
4. In **Section B: Document Metadata**, review the detected Title, Season, Marketing Year (`2027-28`), and Publication Date (`2026-09-30T15:19:00+05:30`).
5. In **Section C: Extracted Table Preview**, review the 6 crops:
   - **Wheat**: ₹2,610 (Cost: 1,264, Margin: 106%)
   - **Barley**: ₹2,286 (Cost: 1,258, Margin: 82%)
   - **Gram**: ₹5,958 (Cost: 3,672, Margin: 62%)
   - **Lentil (Masur)**: ₹7,390 (Cost: 3,824, Margin: 93%)
   - **Rapeseed & Mustard**: ₹6,613 (Cost: 3,345, Margin: 98%)
   - **Safflower**: ₹7,215 (Cost: 4,810, Margin: 50%)
6. Click **🔎 Validate Data** to verify all rows.
7. Click **✅ Approve and Save to MongoDB**. The document is marked `verified` and crop records are stored with BSON Date timestamps.
8. Switch to the **🤖 Chatbot Latest MSP Query Simulation** tab, select **Wheat** and **Rabi**, and click **Query Latest Verified MSP** to verify the record retrieval.

---

## 7. Error Handling Reference

| Error Case | System Behavior |
|------------|-----------------|
| **Scanned / Image PDF** | Raises `ScannedPDFError`. UI displays: `"❌ OCR Required: This PDF appears to be scanned or contains no extractable text. OCR is required before ingestion."` |
| **Duplicate PDF Upload** | Displays alert: `"⚠️ Duplicate Detected: This PDF was previously ingested as '<ID>' with status '<STATUS>'."` |
| **Negative or Zero MSP** | Marked as `error` in row audit. Save is blocked until corrected by administrator. |
| **Duplicate Crop in Table** | Flagged as `error`. Second occurrence is prevented from overwriting. |
| **MongoDB Connection Failure** | Logs warning and automatically activates in-memory `mongomock` client. |

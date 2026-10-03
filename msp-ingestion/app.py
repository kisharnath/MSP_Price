"""
Gradio Web Application for MSP PDF Ingestion and MongoDB Management.
Provides document upload, extraction preview, manual validation, approval/rejection workflows,
and database inspection tabs.
"""

import os
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Tuple
import gradio as gr
import pandas as pd
from dotenv import load_dotenv

from pdf_extractor import extract_pdf_data, calculate_pdf_hash, ScannedPDFError
from msp_parser import parse_extracted_tables, normalize_crop_name, parse_numeric
from database import (
    get_database,
    is_database_mock,
    check_duplicate_document,
    save_approved_document,
    save_rejected_document,
    get_latest_msp,
    get_msp_by_year,
    get_historical_records,
    list_documents,
    list_records
)

load_dotenv()
logger = logging.getLogger(__name__)

SERVER_NAME = os.getenv("GRADIO_SERVER_NAME", "0.0.0.0")
SERVER_PORT = int(os.getenv("GRADIO_SERVER_PORT", "7860"))
ROOT_PATH = os.getenv("GRADIO_ROOT_PATH", "/gradio")

# State holder for currently uploaded PDF
CURRENT_STATE: Dict[str, Any] = {
    "file_path": None,
    "metadata": {},
    "raw_tables": [],
    "df": pd.DataFrame(),
    "validation_logs": [],
    "duplicate_detected": False
}


def load_sample_pdf() -> str:
    """Returns path to the pre-generated official Rabi 2027-28 sample PDF."""
    current_dir = os.path.dirname(os.path.abspath(__file__))
    sample_path = os.path.join(current_dir, "MSP for Rabi Crops for Marketing Season 2027-28.pdf")
    if not os.path.exists(sample_path):
        from generate_sample_pdf import generate_rabi_2027_28_pdf
        generate_rabi_2027_28_pdf(sample_path)
    return sample_path


def on_extract_pdf(file_obj, source_url: str) -> Tuple[
    str, str, str, str, str, str, str, pd.DataFrame, str, str
]:
    """
    Extracts text, table data, and metadata from uploaded PDF.
    Validates duplicates and pre-populates metadata and preview DataFrame.
    """
    if file_obj is None:
        return (
            "", "", "", "", "", "", "",
            pd.DataFrame(),
            "⚠️ Please select or upload a PDF file first.",
            ""
        )

    file_path = file_obj.name if hasattr(file_obj, "name") else str(file_obj)
    CURRENT_STATE["file_path"] = file_path

    try:
        data = extract_pdf_data(file_path)
    except ScannedPDFError as se:
        return (
            "", "", "", "", "", "", "",
            pd.DataFrame(),
            f"❌ OCR Required: {str(se)}",
            ""
        )
    except Exception as e:
        return (
            "", "", "", "", "", "", "",
            pd.DataFrame(),
            f"❌ Extraction Error: {str(e)}",
            ""
        )

    meta = data["metadata"]
    if source_url and source_url.strip():
        meta["source_url"] = source_url.strip()

    content_hash = data["content_hash"]
    CURRENT_STATE["metadata"] = meta
    CURRENT_STATE["raw_tables"] = data["raw_tables"]

    # Check for duplicate document
    dup = check_duplicate_document(content_hash)
    dup_warning = ""
    if dup:
        CURRENT_STATE["duplicate_detected"] = True
        dup_warning = (
            f"⚠️ Duplicate Detected: This PDF was previously ingested as '{dup.get('_id')}' "
            f"with verification status '{dup.get('verification_status')}'. Approving will update existing records."
        )
    else:
        CURRENT_STATE["duplicate_detected"] = False

    # Parse tables
    df, logs = parse_extracted_tables(data["raw_tables"], meta)
    CURRENT_STATE["df"] = df
    CURRENT_STATE["validation_logs"] = logs

    # Build validation summary string
    error_count = sum(1 for l in logs if l["status"] == "error")
    warn_count = sum(1 for l in logs if l["status"] == "warning")
    valid_count = sum(1 for l in logs if l["status"] == "valid")

    summary_text = (
        f"📊 Extracted {len(df)} candidate crop records.\n"
        f"• Valid rows: {valid_count} | ⚠️ Warnings: {warn_count} | ❌ Errors: {error_count}\n"
    )
    if error_count > 0:
        summary_text += "\nErrors detected in extracted rows. Please correct them in the table before approval:\n"
        for l in logs:
            if l["errors"]:
                summary_text += f"- {l['crop_name']}: {', '.join(l['errors'])}\n"

    status_banner = "✅ Extraction succeeded. Please review metadata and crop table below."
    if dup_warning:
        status_banner = f"{dup_warning}\n\n{status_banner}"

    return (
        meta.get("_id", ""),
        meta.get("title", ""),
        meta.get("source_name", "Press Information Bureau"),
        meta.get("source_url", ""),
        meta.get("season", "Rabi"),
        meta.get("marketing_year", "2027-28"),
        meta.get("published_at", ""),
        df,
        status_banner,
        summary_text
    )


def on_validate_dataframe(
    doc_id: str, title: str, season: str, marketing_year: str, published_at: str, df: pd.DataFrame
) -> Tuple[pd.DataFrame, str, str]:
    """
    Re-validates the user-edited table and metadata.
    """
    if df is None or len(df) == 0:
        return df, "❌ No records to validate.", ""

    errors = []
    warnings = []
    seen_crops = set()

    updated_df = df.copy()
    statuses = []

    for idx, row in updated_df.iterrows():
        row_errs = []
        row_warns = []

        raw_crop = str(row.get("crop_name", "")).strip()
        cid = str(row.get("crop_id", "")).strip()
        if not cid and raw_crop:
            norm_id, norm_name, _ = normalize_crop_name(raw_crop)
            cid = norm_id
            updated_df.at[idx, "crop_id"] = cid

        if cid in seen_crops:
            row_errs.append(f"Duplicate crop: '{raw_crop}'")
        else:
            seen_crops.add(cid)

        # Validate MSP
        msp_val = parse_numeric(row.get("msp"))
        if msp_val is None or msp_val <= 0:
            row_errs.append(f"Invalid MSP: '{row.get('msp')}' (must be positive number)")
        else:
            updated_df.at[idx, "msp"] = msp_val

        # Validate Season & Year
        s_val = str(row.get("season", "")).strip() or season
        y_val = str(row.get("marketing_year", "")).strip() or marketing_year
        updated_df.at[idx, "season"] = s_val
        updated_df.at[idx, "marketing_year"] = y_val

        if not s_val:
            row_errs.append("Missing season")
        if not y_val:
            row_errs.append("Missing marketing year")

        if row_errs:
            statuses.append("error")
            errors.append(f"Row {idx+1} ({raw_crop}): " + "; ".join(row_errs))
        elif row_warns:
            statuses.append("warning")
            warnings.append(f"Row {idx+1} ({raw_crop}): " + "; ".join(row_warns))
        else:
            statuses.append("valid")

    updated_df["validation_status"] = statuses
    CURRENT_STATE["df"] = updated_df

    if errors:
        msg = f"❌ Validation failed with {len(errors)} error(s)."
        detail = "\n".join(errors)
    else:
        msg = f"✅ All {len(updated_df)} records passed validation! Ready for Approval."
        detail = "All numeric constraints, crop identities, and season requirements are satisfied."

    return updated_df, msg, detail


def on_approve_and_save(
    doc_id: str,
    title: str,
    source_name: str,
    source_url: str,
    season: str,
    marketing_year: str,
    published_at_str: str,
    df: pd.DataFrame
) -> Tuple[str, str]:
    """
    Applies administrator verification approval and stores document & crop records into MongoDB.
    Enforces that published_at is converted to a timezone-aware BSON Date.
    """
    if df is None or len(df) == 0:
        return "❌ Approval Failed", "No crop records found to approve."

    if not doc_id or not title:
        return "❌ Approval Failed", "Document ID and Title are required."

    # Parse published_at to datetime object
    try:
        if published_at_str:
            pub_dt = datetime.fromisoformat(published_at_str.replace("Z", "+00:00"))
        else:
            pub_dt = datetime.now(timezone.utc)
    except Exception as e:
        return "❌ Approval Failed", f"Invalid published_at format: '{published_at_str}'. Error: {e}"

    # Re-validate
    err_rows = []
    records_to_save: List[Dict[str, Any]] = []

    for idx, row in df.iterrows():
        cid = str(row.get("crop_id", "")).strip()
        cname = str(row.get("crop_name", "")).strip()
        msp_num = parse_numeric(row.get("msp"))

        if not cid or not cname or msp_num is None or msp_num <= 0:
            err_rows.append(f"Row {idx+1} ({cname}) has invalid data")
            continue

        aliases = row.get("crop_aliases", [])
        if isinstance(aliases, str):
            try:
                aliases = json.loads(aliases.replace("'", '"'))
            except Exception:
                aliases = [aliases] if aliases else []

        cost_val = parse_numeric(row.get("cost_of_production"))
        margin_val = parse_numeric(row.get("margin_percent"))

        record_dict = {
            "_id": f"{doc_id}_{cid.upper()}",
            "document_id": doc_id,
            "crop_id": cid,
            "crop_name": cname,
            "crop_aliases": aliases,
            "season": str(row.get("season", season)).strip().capitalize(),
            "marketing_year": str(row.get("marketing_year", marketing_year)).strip(),
            "msp": msp_num,
            "unit": str(row.get("unit", "INR/quintal")),
            "cost_of_production": cost_val,
            "margin_percent": margin_val,
            "published_at": pub_dt,
            "source_url": source_url or None,
            "created_at": datetime.now(timezone.utc)
        }
        records_to_save.append(record_dict)

    if err_rows:
        return "❌ Approval Blocked", "Please resolve validation errors before approving:\n" + "\n".join(err_rows)

    file_name = os.path.basename(CURRENT_STATE.get("file_path") or "notification.pdf")
    content_hash = CURRENT_STATE.get("metadata", {}).get("content_hash") or calculate_pdf_hash(CURRENT_STATE["file_path"]) if CURRENT_STATE.get("file_path") else "hash"

    doc_data = {
        "_id": doc_id,
        "title": title,
        "source_name": source_name,
        "source_url": source_url or None,
        "file_name": file_name,
        "season": season.strip().capitalize(),
        "marketing_year": marketing_year.strip(),
        "published_at": pub_dt,
        "extraction_method": "pdfplumber",
        "content_hash": content_hash
    }

    success, msg, count = save_approved_document(doc_data, records_to_save)
    if success:
        return (
            "🎉 Successfully Approved & Persisted to MongoDB!",
            f"Document '{doc_id}' marked as 'verified'. {count} crop records stored with BSON Date timestamps.\n"
            f"Historical records preserved. The chatbot API can now query verified MSP for {season} {marketing_year}."
        )
    else:
        return "❌ Save Error", msg


def on_reject_document(doc_id: str, title: str, reason: str) -> Tuple[str, str]:
    """
    Rejects the uploaded document. Preserves audit record in msp_documents as 'rejected',
    and does NOT expose crop records to queries.
    """
    if not doc_id:
        return "❌ Rejection Error", "No Document ID provided to reject."

    file_name = os.path.basename(CURRENT_STATE.get("file_path") or "document.pdf")
    content_hash = CURRENT_STATE.get("metadata", {}).get("content_hash") or "hash"

    doc_data = {
        "_id": doc_id,
        "title": title or "Rejected Document",
        "file_name": file_name,
        "content_hash": content_hash,
        "published_at": datetime.now(timezone.utc)
    }

    success, msg = save_rejected_document(doc_data, reason=reason or "Administrator rejected notification")
    if success:
        return (
            "⚠️ Document Marked as Rejected",
            f"Audit metadata preserved in database with status 'rejected'.\n"
            f"Reason: {reason or 'Administrator rejected notification'}\n"
            f"No crop records have been exposed to public or chatbot queries."
        )
    return "❌ Error", msg


def on_reset() -> Tuple[Any, str, str, str, str, str, str, str, pd.DataFrame, str, str]:
    """Resets interface state."""
    CURRENT_STATE["file_path"] = None
    CURRENT_STATE["metadata"] = {}
    CURRENT_STATE["raw_tables"] = []
    CURRENT_STATE["df"] = pd.DataFrame()
    CURRENT_STATE["validation_logs"] = []
    CURRENT_STATE["duplicate_detected"] = False

    return (
        None, "", "", "Press Information Bureau", "", "Rabi", "2027-28", "",
        pd.DataFrame(), "Interface reset. Please upload a PDF to begin.", ""
    )


def refresh_documents_table() -> pd.DataFrame:
    """Fetches documents from database and displays in DataFrame."""
    docs = list_documents()
    if not docs:
        return pd.DataFrame(columns=["_id", "title", "season", "marketing_year", "status", "published_at", "records"])

    rows = []
    for d in docs:
        rows.append({
            "_id": d.get("_id"),
            "title": d.get("title"),
            "season": d.get("season"),
            "marketing_year": d.get("marketing_year"),
            "status": d.get("verification_status"),
            "published_at": str(d.get("published_at")),
            "records": d.get("record_count", 0)
        })
    return pd.DataFrame(rows)


def refresh_records_table(crop_filter: str, season_filter: str, year_filter: str, status_filter: str) -> pd.DataFrame:
    """Queries records table with optional filters."""
    cf = crop_filter if crop_filter and crop_filter != "All" else None
    sf = season_filter if season_filter and season_filter != "All" else None
    yf = year_filter if year_filter and year_filter != "All" else None
    stf = status_filter if status_filter and status_filter != "All" else None

    recs = list_records(crop_id=cf, season=sf, marketing_year=yf, status=stf)
    if not recs:
        return pd.DataFrame(columns=["_id", "crop_name", "season", "marketing_year", "msp", "cost", "margin", "status", "published_at"])

    rows = []
    for r in recs:
        rows.append({
            "_id": r.get("_id"),
            "crop_name": r.get("crop_name"),
            "season": r.get("season"),
            "marketing_year": r.get("marketing_year"),
            "msp": r.get("msp"),
            "cost": r.get("cost_of_production"),
            "margin": f"{r.get('margin_percent')}%" if r.get('margin_percent') is not None else "-",
            "status": r.get("verification_status"),
            "published_at": str(r.get("published_at"))
        })
    return pd.DataFrame(rows)


def simulate_chatbot_latest_query(crop_name_or_alias: str, season: str) -> str:
    """
    Simulates chatbot query for latest verified MSP.
    Calls `get_latest_msp(crop_id, season)`.
    """
    if not crop_name_or_alias:
        return "Please specify a crop name (e.g., Wheat, Gehu, Barley, Gram, Lentil, Masur, Mustard)."

    cid, cname, _ = normalize_crop_name(crop_name_or_alias)
    rec = get_latest_msp(cid, season)
    if not rec:
        return (
            f"❌ No verified MSP record found for crop '{crop_name_or_alias}' (normalized: {cname}) "
            f"in season '{season}'.\n\n"
            f"Ensure official notification has been ingested, verified, and approved by an administrator."
        )

    pub_at_str = str(rec.get("published_at"))
    cost_str = f"INR {rec.get('cost_of_production')}/quintal" if rec.get('cost_of_production') else "N/A"
    margin_str = f"{rec.get('margin_percent')}%" if rec.get('margin_percent') else "N/A"

    return (
        f"🌾 Latest Verified Minimum Support Price (MSP):\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"• Crop: {rec.get('crop_name')} (ID: {rec.get('crop_id')})\n"
        f"• Season: {rec.get('season')} (Marketing Year: {rec.get('marketing_year')})\n"
        f"• Verified MSP: ₹{rec.get('msp'):,.2f} per quintal\n"
        f"• Cost of Production (A2+FL): {cost_str}\n"
        f"• Margin over Cost: {margin_str}\n"
        f"• Official Published Time: {pub_at_str}\n"
        f"• Document ID: {rec.get('document_id')}\n"
        f"• Status: {rec.get('verification_status').upper()} ✅\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"(Retrieved using chronological sorting by published_at BSON Date descending)"
    )


def create_ui() -> gr.Blocks:
    """Builds the Gradio UI blocks."""
    with gr.Blocks(title="MSP PDF Ingestion & MongoDB Management System") as demo:
        gr.Markdown(
            "# 🌾 MSP PDF Ingestion & MongoDB Management System\n"
            "Official Government of India Minimum Support Price (MSP) notification extraction, validation, and historical persistence pipeline."
        )

        with gr.Tabs():
            # TAB 1: Ingestion & Verification
            with gr.TabItem("📥 Ingestion & Verification Workflow"):
                with gr.Row():
                    with gr.Column(scale=1):
                        gr.Markdown("### Section A: Upload Government PDF")
                        pdf_input = gr.File(
                            label="Upload Official MSP Notification PDF",
                            file_types=[".pdf"],
                            type="filepath"
                        )
                        source_url_input = gr.Textbox(
                            label="Official Source URL (Optional)",
                            placeholder="https://www.pib.gov.in/PressReleaseDetail.aspx?PRID=...",
                            value="https://www.pib.gov.in/PressReleaseDetail.aspx?PRID=2316956&reg=48&lang=1"
                        )
                        with gr.Row():
                            extract_btn = gr.Button("🔍 Extract Text & Tables", variant="primary")
                            load_sample_btn = gr.Button("📄 Load Official Sample PDF (Rabi 2027-28)")

                        status_output = gr.Textbox(
                            label="System Status & Alerts",
                            value="Ready. Upload a PDF or click 'Load Official Sample PDF'.",
                            interactive=False,
                            lines=3
                        )

                    with gr.Column(scale=1):
                        gr.Markdown("### Section B: Document Metadata")
                        doc_id_input = gr.Textbox(label="Document ID (_id)", placeholder="PIB_RABI_2027_28")
                        title_input = gr.Textbox(label="Notification Title", placeholder="MSP for Rabi Crops")
                        with gr.Row():
                            source_name_input = gr.Textbox(label="Source Name", value="Press Information Bureau")
                            season_input = gr.Dropdown(label="Season", choices=["Rabi", "Kharif", "Zaid"], value="Rabi")
                        with gr.Row():
                            year_input = gr.Textbox(label="Marketing Year", placeholder="2027-28", value="2027-28")
                            pub_date_input = gr.Textbox(label="Publication Timestamp (ISO-8601)", placeholder="2026-09-30T15:19:00+05:30")

                gr.Markdown("### Section C: Extracted Table Preview & Correction")
                gr.Markdown("Inspect and edit any cell below. Previous-season columns are discarded automatically.")
                preview_df = gr.DataFrame(
                    headers=[
                        "crop_id", "crop_name", "season", "marketing_year",
                        "msp", "unit", "cost_of_production", "margin_percent",
                        "validation_status"
                    ],
                    datatype=["str", "str", "str", "str", "number", "str", "number", "number", "str"],
                    interactive=True,
                    wrap=True
                )

                validation_summary = gr.Textbox(
                    label="Validation Audit & Error Log",
                    interactive=False,
                    lines=4
                )

                gr.Markdown("### Section D: Review & Approval Decision")
                with gr.Row():
                    validate_btn = gr.Button("🔎 Validate Data", variant="secondary")
                    approve_btn = gr.Button("✅ Approve and Save to MongoDB", variant="primary")
                    reject_btn = gr.Button("⛔ Reject Document", variant="stop")
                    reset_btn = gr.Button("🔄 Reset")

                rejection_reason_input = gr.Textbox(
                    label="Rejection Reason (Required only if Rejecting)",
                    placeholder="e.g. Scanned low quality, ambiguous crop column, missing signatures..."
                )

                decision_banner = gr.Textbox(label="Audit Decision Result", interactive=False, lines=2)

            # TAB 2: Database Explorer
            with gr.TabItem("🗄️ Database Explorer & Verification Audit"):
                gr.Markdown("### Stored Documents & Audit Metadata")
                docs_df = gr.DataFrame(interactive=False)
                refresh_docs_btn = gr.Button("🔄 Refresh Documents List")

                gr.Markdown("### Stored Crop Records (Historical Pool)")
                with gr.Row():
                    filter_crop = gr.Dropdown(
                        label="Filter by Crop",
                        choices=["All", "wheat", "barley", "gram", "lentil_masur", "rapeseed_mustard", "safflower"],
                        value="All"
                    )
                    filter_season = gr.Dropdown(label="Filter by Season", choices=["All", "Rabi", "Kharif", "Zaid"], value="All")
                    filter_year = gr.Dropdown(label="Filter by Marketing Year", choices=["All", "2027-28", "2026-27", "2025-26"], value="All")
                    filter_status = gr.Dropdown(label="Filter by Status", choices=["All", "verified", "pending", "rejected"], value="All")
                records_df = gr.DataFrame(interactive=False)
                refresh_recs_btn = gr.Button("🔄 Filter & Refresh Records")

            # TAB 3: Chatbot Retrieval Simulation
            with gr.TabItem("🤖 Chatbot Latest MSP Query Simulation"):
                gr.Markdown(
                    "### Query Latest Verified MSP (Testing `get_latest_msp`)\n"
                    "Simulates the chatbot retrieving the latest published, verified MSP for a crop and season. "
                    "Sorts by `published_at` BSON Date descending."
                )
                with gr.Row():
                    chat_crop_input = gr.Dropdown(
                        label="Crop (or Alias)",
                        choices=["Wheat", "Gehu", "Barley", "Jau", "Gram", "Chana", "Lentil (Masur)", "Masur", "Rapeseed & Mustard", "Mustard", "Safflower", "Kusum"],
                        value="Wheat"
                    )
                    chat_season_input = gr.Dropdown(label="Season", choices=["Rabi", "Kharif"], value="Rabi")
                    query_btn = gr.Button("💬 Query Latest Verified MSP", variant="primary")

                chatbot_response_box = gr.Textbox(label="Chatbot Response", interactive=False, lines=10)

        # Wire Events
        load_sample_btn.click(
            fn=load_sample_pdf,
            outputs=[pdf_input]
        )

        extract_btn.click(
            fn=on_extract_pdf,
            inputs=[pdf_input, source_url_input],
            outputs=[
                doc_id_input, title_input, source_name_input, source_url_input,
                season_input, year_input, pub_date_input,
                preview_df, status_output, validation_summary
            ]
        )

        validate_btn.click(
            fn=on_validate_dataframe,
            inputs=[doc_id_input, title_input, season_input, year_input, pub_date_input, preview_df],
            outputs=[preview_df, status_output, validation_summary]
        )

        approve_btn.click(
            fn=on_approve_and_save,
            inputs=[
                doc_id_input, title_input, source_name_input, source_url_input,
                season_input, year_input, pub_date_input, preview_df
            ],
            outputs=[status_output, decision_banner]
        )

        reject_btn.click(
            fn=on_reject_document,
            inputs=[doc_id_input, title_input, rejection_reason_input],
            outputs=[status_output, decision_banner]
        )

        reset_btn.click(
            fn=on_reset,
            outputs=[
                pdf_input, doc_id_input, title_input, source_name_input,
                source_url_input, season_input, year_input, pub_date_input,
                preview_df, status_output, decision_banner
            ]
        )

        refresh_docs_btn.click(fn=refresh_documents_table, outputs=[docs_df])
        refresh_recs_btn.click(
            fn=refresh_records_table,
            inputs=[filter_crop, filter_season, filter_year, filter_status],
            outputs=[records_df]
        )
        query_btn.click(
            fn=simulate_chatbot_latest_query,
            inputs=[chat_crop_input, chat_season_input],
            outputs=[chatbot_response_box]
        )

    return demo


demo = create_ui()

if __name__ == "__main__":
    logger.info(f"Starting Gradio server on {SERVER_NAME}:{SERVER_PORT} with root_path='{ROOT_PATH}'")
    demo.launch(
        server_name=SERVER_NAME,
        server_port=SERVER_PORT,
        root_path=ROOT_PATH,
        share=False,
        prevent_thread_lock=False
    )

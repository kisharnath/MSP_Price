import type { Db } from 'mongodb';

/**
 * MongoDB schema for MSP data (database: agriculture_db).
 *
 * msp_documents  – one per PIB press release
 * msp_records    – one per crop/variety row in a release's table
 */

export interface MspDocument {
  _id: string; // PIB_<SEASON>_<YEAR>, e.g. PIB_KHARIF_2026_27
  title: string;
  source_name: string;
  source_url: string;
  press_release_id: string | null;
  file_name: string;
  season: string;
  marketing_year: string;
  published_at: Date;
  content_hash: string;
  verification_status: 'pending' | 'verified' | 'rejected';
  crop_count: number;
  highlights: Record<string, unknown>; // narrative stats from the release (procurement, margins, ...)
  created_at: Date;
  updated_at: Date;
}

export interface MspRecord {
  _id: string; // <document_id>_<CROP_ID>
  document_id: string;
  serial_no: number | null;
  crop_id: string;
  crop_name: string; // display name incl. variety, e.g. "Paddy (Grade A)"
  crop_group: string | null; // base crop, e.g. "Paddy"
  variety: string | null; // Common | Grade A | Hybrid | Maldandi | Medium Staple | Long Staple
  category: string | null; // Cereals | Pulses | Oilseeds | Commercial | Rabi crops
  crop_aliases: string[];
  season: string;
  marketing_year: string;
  unit: string;
  msp: number;
  cost_of_production: number | null; // null when not compiled (variants)
  margin_percent: number | null;
  prev_year_label: string | null; // e.g. "2025-26"
  prev_year_msp: number | null;
  increase_abs: number | null; // vs previous year
  increase_pct: number | null; // vs previous year (computed, 2dp)
  base_year_label: string | null; // "2013-14" (Kharif release only)
  base_year_msp: number | null;
  increase_over_base_abs: number | null;
  increase_over_base_pct: number | null;
  notes: string[];
  published_at: Date;
  validation_status: 'valid' | 'warning' | 'error';
  created_at: Date;
  updated_at: Date;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function ensureIndexes(db: Db) {
  await db.collection('msp_records').createIndex({ document_id: 1, crop_id: 1 }, { unique: true });
  await db.collection('msp_records').createIndex({ crop_id: 1, season: 1, marketing_year: 1 });
  await db.collection('msp_records').createIndex({ crop_group: 1, marketing_year: -1 });
  await db.collection('msp_documents').createIndex({ season: 1, marketing_year: 1 });
  await db.collection('msp_documents').createIndex({ content_hash: 1 });
}

/** Upserts a document and its records. Keeps created_at on re-runs. */
export async function upsertMspData(
  db: Db,
  doc: Omit<MspDocument, 'created_at' | 'updated_at'>,
  records: Omit<MspRecord, 'created_at' | 'updated_at'>[]
) {
  const now = new Date();
  await ensureIndexes(db);
  await db.collection<any>('msp_documents').updateOne(
    { _id: doc._id } as any,
    { $set: { ...doc, crop_count: records.length, updated_at: now }, $setOnInsert: { created_at: now } },
    { upsert: true }
  );
  for (const r of records) {
    await db.collection<any>('msp_records').updateOne(
      { _id: r._id } as any,
      { $set: { ...r, updated_at: now }, $setOnInsert: { created_at: now } },
      { upsert: true }
    );
  }
  return { documentId: doc._id, recordsCount: records.length };
}

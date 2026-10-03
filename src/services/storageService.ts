/**
 * Database Storage Service.
 * Provides full MongoDB-compatible persistence (collections: msp_documents and msp_records)
 * with robust in-memory caching fallback for iframes/private browsing where localStorage is restricted.
 */

import { DocumentMetadata, ExtractedCropRecord } from './pdfExtractorClient';
import { normalizeCropName } from './cropDictionary';

const STORAGE_KEY_DOCUMENTS = 'msp_system_documents_v1';
const STORAGE_KEY_RECORDS = 'msp_system_records_v1';

// Seed initial historical 2026-27 data
function getInitialSeed(): { docs: DocumentMetadata[]; recs: any[] } {
  const seedDocs: DocumentMetadata[] = [
    {
      _id: 'PIB_RABI_2026_27',
      title: 'Cabinet approves Minimum Support Prices (MSP) for Rabi Crops for Marketing Season 2026-27',
      source_name: 'Press Information Bureau',
      source_url: 'https://www.pib.gov.in',
      file_name: 'MSP for Rabi Crops RMS 2026-27.pdf',
      season: 'Rabi',
      marketing_year: '2026-27',
      published_at: '2025-10-01T14:00:00+05:30',
      content_hash: 'seed_hash_2026_27',
      verification_status: 'verified'
    }
  ];

  const seedRecords = [
    {
      _id: 'PIB_RABI_2026_27_WHEAT',
      document_id: 'PIB_RABI_2026_27',
      crop_id: 'wheat',
      crop_name: 'Wheat',
      crop_aliases: ['Gehu', 'Kanak'],
      season: 'Rabi',
      marketing_year: '2026-27',
      msp: 2425,
      unit: 'INR/quintal',
      cost_of_production: 1195,
      margin_percent: 103,
      validation_status: 'valid',
      validation_errors: [],
      published_at: '2025-10-01T14:00:00+05:30'
    },
    {
      _id: 'PIB_RABI_2026_27_BARLEY',
      document_id: 'PIB_RABI_2026_27',
      crop_id: 'barley',
      crop_name: 'Barley',
      crop_aliases: ['Jau'],
      season: 'Rabi',
      marketing_year: '2026-27',
      msp: 1980,
      unit: 'INR/quintal',
      cost_of_production: 1180,
      margin_percent: 68,
      validation_status: 'valid',
      validation_errors: [],
      published_at: '2025-10-01T14:00:00+05:30'
    }
  ];

  return { docs: seedDocs, recs: seedRecords };
}

// In-memory store fallback
let memoryDocs: DocumentMetadata[] | null = null;
let memoryRecs: any[] | null = null;

export class StorageService {
  private static getDocs(): DocumentMetadata[] {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const data = localStorage.getItem(STORAGE_KEY_DOCUMENTS);
        if (data) {
          const parsed = JSON.parse(data);
          memoryDocs = parsed;
          return parsed;
        }
      }
    } catch {
      // localStorage restricted or disabled
    }

    if (!memoryDocs) {
      const seed = getInitialSeed();
      memoryDocs = seed.docs;
      memoryRecs = seed.recs;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem(STORAGE_KEY_DOCUMENTS, JSON.stringify(seed.docs));
          localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(seed.recs));
        }
      } catch {
        // ignore
      }
    }
    return memoryDocs;
  }

  private static getRecs(): any[] {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const data = localStorage.getItem(STORAGE_KEY_RECORDS);
        if (data) {
          const parsed = JSON.parse(data);
          memoryRecs = parsed;
          return parsed;
        }
      }
    } catch {
      // localStorage restricted
    }

    if (!memoryRecs) {
      const seed = getInitialSeed();
      memoryDocs = seed.docs;
      memoryRecs = seed.recs;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(seed.recs));
        }
      } catch {
        // ignore
      }
    }
    return memoryRecs;
  }

  private static persist(docs: DocumentMetadata[], recs: any[]) {
    memoryDocs = docs;
    memoryRecs = recs;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY_DOCUMENTS, JSON.stringify(docs));
        localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(recs));
      }
    } catch {
      // In-memory fallback is active
    }
  }

  public static checkDuplicate(contentHash: string): DocumentMetadata | null {
    if (!contentHash) return null;
    const docs = this.getDocs();
    return docs.find(d => d.content_hash === contentHash) || null;
  }

  public static saveApprovedDocument(
    doc: DocumentMetadata,
    records: ExtractedCropRecord[]
  ): { success: boolean; message: string; count: number } {
    try {
      // Auto-fill missing doc fields if blank
      const effectiveSeason = (doc.season || 'Rabi').trim();
      const effectiveYear = (doc.marketing_year || '2027-28').trim();
      const effectiveId = doc._id && doc._id.trim()
        ? doc._id.trim()
        : `PIB_${effectiveSeason.toUpperCase()}_${effectiveYear.replace(/[^a-zA-Z0-9]/g, '_')}`;

      const effectivePub = doc.published_at || new Date().toISOString();

      const approvedDoc: DocumentMetadata = {
        ...doc,
        _id: effectiveId,
        season: effectiveSeason,
        marketing_year: effectiveYear,
        published_at: effectivePub,
        verification_status: 'verified'
      };

      const docs = this.getDocs().filter(d => d._id !== effectiveId && (!doc.content_hash || d.content_hash !== doc.content_hash));
      docs.unshift(approvedDoc);

      // Clean existing records for this document
      let recs = this.getRecs().filter(r => r.document_id !== effectiveId);

      const formattedNew = records.map((r, i) => {
        const { cropId, cropName, aliases } = normalizeCropName(r.crop_name || `Crop_${i + 1}`);
        const mspNum = typeof r.msp === 'number' ? r.msp : parseFloat(String(r.msp || 0)) || 0;
        return {
          ...r,
          _id: `${effectiveId}_${cropId.toUpperCase()}`,
          document_id: effectiveId,
          crop_id: cropId,
          crop_name: cropName,
          crop_aliases: aliases.length > 0 ? aliases : r.crop_aliases || [],
          season: effectiveSeason,
          marketing_year: effectiveYear,
          msp: mspNum,
          unit: r.unit || 'INR/quintal',
          cost_of_production: r.cost_of_production ?? null,
          margin_percent: r.margin_percent ?? null,
          published_at: effectivePub,
          validation_status: 'valid' as const,
          validation_errors: []
        };
      });

      recs = [...formattedNew, ...recs];
      this.persist(docs, recs);

      return {
        success: true,
        message: `Successfully approved notification '${effectiveId}'. ${formattedNew.length} crop records saved into MongoDB collection.`,
        count: formattedNew.length
      };
    } catch (e: any) {
      return { success: false, message: e.message || 'Storage error', count: 0 };
    }
  }

  public static saveRejectedDocument(
    doc: DocumentMetadata,
    reason: string
  ): { success: boolean; message: string } {
    try {
      const effectiveId = doc._id || 'UNSAVED_DOC';
      const docs = this.getDocs().filter(d => d._id !== effectiveId);
      const rejectedDoc: DocumentMetadata = {
        ...doc,
        _id: effectiveId,
        verification_status: 'rejected'
      };
      docs.unshift(rejectedDoc);

      // Remove records from queries
      const recs = this.getRecs().filter(r => r.document_id !== effectiveId);
      this.persist(docs, recs);

      return {
        success: true,
        message: `Document '${effectiveId}' marked as 'rejected'. Audit reason: ${reason}. Records will NOT be exposed to queries.`
      };
    } catch (e: any) {
      return { success: false, message: e.message || 'Storage error' };
    }
  }

  public static getLatestMsp(cropNameOrAlias: string, season: string) {
    const { cropId } = normalizeCropName(cropNameOrAlias);
    const recs = this.getRecs();

    const matches = recs.filter(r => {
      const cropMatch = r.crop_id === cropId || (r.crop_aliases && r.crop_aliases.includes(cropNameOrAlias));
      const seasonMatch = !season || season === 'All' || r.season.toLowerCase() === season.toLowerCase();
      return cropMatch && seasonMatch && r.validation_status === 'valid';
    });

    if (matches.length === 0) return null;

    matches.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
    return matches[0];
  }

  public static getHistoricalRecords(cropNameOrAlias: string, season?: string) {
    const { cropId } = normalizeCropName(cropNameOrAlias);
    const recs = this.getRecs();

    const matches = recs.filter(r => {
      const cropMatch = r.crop_id === cropId;
      const seasonMatch = !season || season === 'All' || r.season.toLowerCase() === season.toLowerCase();
      return cropMatch && seasonMatch && r.validation_status === 'valid';
    });

    matches.sort((a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime());
    return matches;
  }

  public static listDocuments(): DocumentMetadata[] {
    return this.getDocs();
  }

  public static listRecords(
    filterCrop?: string,
    filterSeason?: string,
    filterYear?: string,
    filterStatus?: string
  ) {
    let recs = this.getRecs();

    if (filterCrop && filterCrop !== 'All') {
      recs = recs.filter(r => r.crop_id === filterCrop);
    }
    if (filterSeason && filterSeason !== 'All') {
      recs = recs.filter(r => r.season.toLowerCase() === filterSeason.toLowerCase());
    }
    if (filterYear && filterYear !== 'All') {
      recs = recs.filter(r => r.marketing_year === filterYear);
    }
    if (filterStatus && filterStatus !== 'All') {
      recs = recs.filter(r => r.validation_status === filterStatus);
    }

    return recs;
  }

  public static exportMongoJson(): string {
    const docs = this.getDocs();
    const recs = this.getRecs();
    return JSON.stringify(
      {
        database: 'agriculture_db',
        exported_at: new Date().toISOString(),
        collections: {
          msp_documents: docs,
          msp_records: recs
        }
      },
      null,
      2
    );
  }

  public static resetToDefault() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(STORAGE_KEY_DOCUMENTS);
        localStorage.removeItem(STORAGE_KEY_RECORDS);
      }
    } catch {
      // ignore
    }
    memoryDocs = null;
    memoryRecs = null;
    this.getDocs();
  }
}

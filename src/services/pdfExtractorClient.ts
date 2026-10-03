/**
 * Pure Client-Side PDF Text and Table Extraction Engine.
 * Runs in any browser environment on Vercel without requiring Python or backend servers.
 * Uses pdfjs-dist for text layer item extraction and SHA-256 cryptographic hashing.
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parseMspTable } from './mspTableParser';

// Set up pdfjs worker bundled natively with Vite for reliable, zero-CDN execution
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export interface ExtractedCropRecord {
  crop_id: string;
  crop_name: string;
  crop_aliases: string[];
  season: string;
  marketing_year: string;
  msp: number | null;
  unit: string;
  cost_of_production: number | null;
  margin_percent: number | null;
  validation_status: 'valid' | 'warning' | 'error';
  validation_errors: string[];
  serial_no?: number | null;
  crop_group?: string | null;
  variety?: string | null;
  category?: string | null;
  prev_year_label?: string | null;
  prev_year_msp?: number | null;
  increase_abs?: number | null;
  base_year_label?: string | null;
  base_year_msp?: number | null;
  increase_over_base_abs?: number | null;
  increase_over_base_pct?: number | null;
  notes?: string[];
}

export interface DocumentMetadata {
  _id: string;
  title: string;
  source_name: string;
  source_url: string;
  file_name: string;
  season: string;
  marketing_year: string;
  published_at: string; // ISO 8601
  content_hash: string;
  verification_status: 'pending' | 'verified' | 'rejected';
  press_release_id?: string | null;
  highlights?: Record<string, unknown>;
}

export interface ExtractionResult {
  metadata: DocumentMetadata;
  records: ExtractedCropRecord[];
  rawText: string;
  logs: {
    status: 'valid' | 'warning' | 'error';
    crop_name: string;
    errors: string[];
  }[];
}

/**
 * Calculates SHA-256 hash of an ArrayBuffer in the browser using Web Crypto API.
 */
export async function calculateHash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Cleans numerical strings (removes Rs, ₹, commas, %, /-).
 */
export function parseNumeric(val: any): number | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s || ['-', '--', 'na', 'n/a', 'nil', 'none'].includes(s.toLowerCase())) {
    return null;
  }

  const isNegative = s.startsWith('-');
  // remove trailing "/-"
  const cleanedTrailing = s.replace(/\/[-–]*$/, '');
  // strip currency, commas, %
  const cleaned = cleanedTrailing.replace(/[Rs\.\,₹\%\sA-Za-z]/g, '');
  const match = cleaned.match(/[-+]?\d+(?:\.\d+)?/);
  if (match) {
    let num = parseFloat(match[0]);
    if (isNegative && num > 0) num = -num;
    return isNaN(num) ? null : num;
  }
  return null;
}

/**
 * Parses publication date/time from text into an ISO 8601 timezone-aware string (IST +05:30).
 */
export function parsePublicationDatetime(text: string): string {
  // Pattern 1: Posted On: 30 SEP 2026 3:19PM by PIB Delhi
  const pibMatch = text.match(/posted\s+on\s*:?\s*([0-9]{1,2})\s+([A-Za-z]{3,})\s+([0-9]{4})(?:\s+([0-9]{1,2}):([0-9]{2})\s*([AP]M)?)?/i);
  if (pibMatch) {
    const day = parseInt(pibMatch[1], 10);
    const monthStr = pibMatch[2].substring(0, 3).toUpperCase();
    const year = parseInt(pibMatch[3], 10);
    const months: Record<string, string> = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
    };
    const month = months[monthStr] || '01';

    let hour = 12;
    let minute = 0;
    if (pibMatch[4] && pibMatch[5]) {
      hour = parseInt(pibMatch[4], 10);
      minute = parseInt(pibMatch[5], 10);
      const meridian = (pibMatch[6] || '').toUpperCase();
      if (meridian === 'PM' && hour < 12) hour += 12;
      if (meridian === 'AM' && hour === 12) hour = 0;
    }

    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${month}-${dd}T${hh}:${mm}:00+05:30`;
  }

  // Fallback to current time in IST
  return new Date().toISOString();
}

/**
 * Extracts text and tabular crop data from PDF ArrayBuffer.
 */
export async function extractPdfClient(
  buffer: ArrayBuffer,
  fileName: string = 'notification.pdf',
  sourceUrl: string = ''
): Promise<ExtractionResult> {
  const contentHash = await calculateHash(buffer);

  // Load PDF with pdfjs
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  let fullText = '';
  interface TextItemPos {
    str: string;
    x: number;
    y: number;
    page: number;
  }
  const allItems: TextItemPos[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    for (const item of textContent.items) {
      if ('str' in item && item.str.trim()) {
        const tx = (item.transform as number[])[4];
        const ty = (item.transform as number[])[5];
        allItems.push({
          str: item.str,
          x: tx,
          y: ty,
          page: pageNum
        });
        fullText += item.str + ' ';
      }
    }
    fullText += '\n';
  }

  // OCR detection check
  if (!fullText.trim() && allItems.length === 0) {
    throw new Error('This PDF appears to be scanned or contains no extractable text. OCR is required before ingestion.');
  }

  // Extract Metadata
  let season = 'Rabi';
  if (/kharif/i.test(fullText)) season = 'Kharif';
  else if (/zaid/i.test(fullText)) season = 'Zaid';

  let marketingYear = '2027-28';
  const myMatch = fullText.match(/(?:marketing\s+season|marketing\s+year|rms|kms)?\s*(\d{4}[-–]\d{2,4})/i);
  if (myMatch) {
    marketingYear = myMatch[1].replace('–', '-');
  }

  const publishedAt = parsePublicationDatetime(fullText);

  // Title detection
  let title = `Cabinet approves Minimum Support Prices (MSP) for ${season} Crops for Marketing Season ${marketingYear}`;
  const titleMatch = fullText.match(/(?:Cabinet approves|Minimum Support Prices).*?(?:Marketing Season\s*\d{4}[-–]\d{2,4})/i);
  if (titleMatch) {
    title = titleMatch[0].replace(/\s+/g, ' ').trim();
  }

  const cleanSeasonSlug = season.toUpperCase();
  const cleanYearSlug = marketingYear.replace('-', '_');
  const docId = `PIB_${cleanSeasonSlug}_${cleanYearSlug}`;

  const candidateRecords: ExtractedCropRecord[] = parseMspTable(allItems, season, marketingYear);
  const logs: { status: 'valid' | 'warning' | 'error'; crop_name: string; errors: string[] }[] =
    candidateRecords.map(r => ({ status: r.validation_status, crop_name: r.crop_name, errors: r.validation_errors }));

  const releaseId = fullText.match(/Release ID:\s*(\d+)/i)?.[1] ?? null;
  const pibUrl = fullText.match(/https?:\/\/www\.pib\.gov\.in\/[^\s]+/i)?.[0] ?? '';

  const metadata: DocumentMetadata = {
    _id: docId,
    title,
    source_name: 'Press Information Bureau',
    source_url: sourceUrl || pibUrl || 'https://www.pib.gov.in',
    press_release_id: releaseId,
    file_name: fileName,
    season,
    marketing_year: marketingYear,
    published_at: publishedAt,
    content_hash: contentHash,
    verification_status: 'pending'
  };

  return {
    metadata,
    records: candidateRecords,
    rawText: fullText,
    logs
  };
}

import type { MspDocument, MspRecord } from './mspSchema.js';
import { round2 } from './mspSchema.js';

type DocSeed = Omit<MspDocument, 'created_at' | 'updated_at'>;
type RecSeed = Omit<MspRecord, 'created_at' | 'updated_at'>;

// ---------- Kharif 2026-27 (PIB release 2260617, posted 13 May 2026) ----------
const KHARIF_DOC_ID = 'PIB_KHARIF_2026_27';
const KHARIF_PUBLISHED = new Date('2026-05-13T15:23:00+05:30');

// [serial, group, variety, category, msp, cost, margin, prev(2025-26), base(2013-14), incAbs, incOverBase, incOverBasePct, aliases]
type KRow = [number, string, string | null, string, number, number | null, number | null, number, number, number, number, number, string[]];
const KHARIF_ROWS: KRow[] = [
  [1, 'Paddy', 'Common', 'Cereals', 2441, 1627, 50, 2369, 1310, 72, 1131, 86, ['Dhan', 'Rice']],
  [1, 'Paddy', 'Grade A', 'Cereals', 2461, null, null, 2389, 1345, 72, 1116, 83, ['Dhan Grade A']],
  [2, 'Jowar', 'Hybrid', 'Cereals', 4023, 2682, 50, 3699, 1500, 324, 2523, 168, ['Sorghum Hybrid']],
  [2, 'Jowar', 'Maldandi', 'Cereals', 4073, null, null, 3749, 1520, 324, 2553, 168, []],
  [3, 'Bajra', null, 'Cereals', 2900, 1858, 56, 2775, 1250, 125, 1650, 132, ['Pearl Millet']],
  [4, 'Ragi', null, 'Cereals', 5205, 3470, 50, 4886, 1500, 319, 3705, 247, ['Finger Millet', 'Mandua']],
  [5, 'Maize', null, 'Cereals', 2410, 1544, 56, 2400, 1310, 10, 1100, 84, ['Makka']],
  [6, 'Tur/Arhar', null, 'Pulses', 8450, 5496, 54, 8000, 4300, 450, 4150, 97, ['Tur', 'Arhar', 'Pigeon Pea']],
  [7, 'Moong', null, 'Pulses', 8780, 5438, 61, 8768, 4500, 12, 4280, 95, ['Green Gram']],
  [8, 'Urad', null, 'Pulses', 8200, 5418, 51, 7800, 4300, 400, 3900, 91, ['Black Gram']],
  [9, 'Groundnut', null, 'Oilseeds', 7517, 5011, 50, 7263, 4000, 254, 3517, 88, ['Peanut']],
  [10, 'Sunflower Seed', null, 'Oilseeds', 8343, 5562, 50, 7721, 3700, 622, 4643, 125, ['Sunflower']],
  [11, 'Soybean', 'Yellow', 'Oilseeds', 5708, 3805, 50, 5328, 2560, 380, 3148, 123, ['Soyabean']],
  [12, 'Sesamum', null, 'Oilseeds', 10346, 6897, 50, 9846, 4500, 500, 5846, 130, ['Sesame', 'Til']],
  [13, 'Nigerseed', null, 'Oilseeds', 10052, 6701, 50, 9537, 3500, 515, 6552, 187, ['Niger', 'Ramtil']],
  [14, 'Cotton', 'Medium Staple', 'Commercial', 8267, 5511, 50, 7710, 3700, 557, 4567, 123, ['Kapas']],
  [14, 'Cotton', 'Long Staple', 'Commercial', 8667, null, null, 8110, 4000, 557, 4667, 117, ['Kapas Long Staple']],
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const kharifRecords: RecSeed[] = KHARIF_ROWS.map(
  ([serial, group, variety, category, msp, cost, margin, prev, base, incAbs, incBase, incBasePct, aliases]) => {
    const cropId = slug(variety ? `${group}_${variety}` : group);
    const costMissing = cost === null;
    return {
      _id: `${KHARIF_DOC_ID}_${cropId.toUpperCase()}`,
      document_id: KHARIF_DOC_ID,
      serial_no: serial,
      crop_id: cropId,
      crop_name: variety ? `${group} (${variety})` : group,
      crop_group: group,
      variety,
      category,
      crop_aliases: aliases,
      season: 'Kharif',
      marketing_year: '2026-27',
      unit: 'INR/quintal',
      msp,
      cost_of_production: cost,
      margin_percent: margin,
      prev_year_label: '2025-26',
      prev_year_msp: prev,
      increase_abs: incAbs,
      increase_pct: round2((incAbs / prev) * 100),
      base_year_label: '2013-14',
      base_year_msp: base,
      increase_over_base_abs: incBase,
      increase_over_base_pct: incBasePct,
      notes: costMissing ? ['Cost data not separately compiled for this variety'] : [],
      published_at: KHARIF_PUBLISHED,
      validation_status: 'valid',
    };
  }
);

const kharifDoc: DocSeed = {
  _id: KHARIF_DOC_ID,
  title: 'Cabinet approves Minimum Support Prices (MSP) for Kharif Crops for Marketing Season 2026-27',
  source_name: 'Press Information Bureau',
  source_url: 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2260617&reg=3&lang=1',
  press_release_id: '2260617',
  file_name: '2026-27_Kharif_MSP.pdf',
  season: 'Kharif',
  marketing_year: '2026-27',
  published_at: KHARIF_PUBLISHED,
  content_hash: '',
  verification_status: 'verified',
  crop_count: kharifRecords.length,
  highlights: {
    crops_covered: 14,
    top_absolute_increases: [
      { crop: 'Sunflower Seed', inr_per_quintal: 622 },
      { crop: 'Cotton', inr_per_quintal: 557 },
      { crop: 'Nigerseed', inr_per_quintal: 515 },
      { crop: 'Sesamum', inr_per_quintal: 500 },
    ],
    highest_margins_percent: { Moong: 61, Bajra: 56, Maize: 56, 'Tur/Arhar': 54, others: 50 },
    procurement_lmt: {
      paddy: { '2014-15_to_2025-26': 8418, '2004-05_to_2013-14': 4590 },
      kharif_14_crops: { '2014-15_to_2025-26': 8746, '2004-05_to_2013-14': 4679 },
    },
    msp_paid_lakh_crore: {
      paddy: { '2014-15_to_2025-26': 16.08, '2004-05_to_2013-14': 4.44 },
      kharif_14_crops: { '2014-15_to_2025-26': 18.99, '2004-05_to_2013-14': 4.75 },
    },
    cost_definition: 'All paid-out costs (hired labour, machinery, leased land rent, inputs, irrigation, depreciation, interest, fuel/electricity, misc.) plus imputed value of family labour.',
  },
};

// ---------- Rabi 2027-28 (PIB release 2316956, posted 30 Sep 2026) ----------
const RABI_DOC_ID = 'PIB_RABI_2027_28';
const RABI_PUBLISHED = new Date('2026-09-30T15:19:00+05:30');

// [serial, id, name, cost, margin, msp, prev(2026-27), incAbs, aliases]
const RABI_ROWS: [number, string, string, number, number, number, number, number, string[]][] = [
  [1, 'wheat', 'Wheat', 1264, 106, 2610, 2585, 25, ['Gehu']],
  [2, 'barley', 'Barley', 1447, 58, 2286, 2150, 136, ['Jau']],
  [3, 'gram', 'Gram', 3751, 59, 5958, 5875, 83, ['Chana']],
  [4, 'lentil_masur', 'Lentil (Masur)', 3854, 92, 7390, 7000, 390, ['Lentil', 'Masoor']],
  [5, 'rapeseed_mustard', 'Rapeseed & Mustard', 3367, 96, 6613, 6200, 413, ['Sarson', 'Rai']],
  [6, 'safflower', 'Safflower', 4810, 50, 7215, 6540, 675, ['Kardi', 'Kusum']],
];

const rabiRecords: RecSeed[] = RABI_ROWS.map(([serial, id, name, cost, margin, msp, prev, inc, aliases]) => ({
  _id: `${RABI_DOC_ID}_${id.toUpperCase()}`,
  document_id: RABI_DOC_ID,
  serial_no: serial,
  crop_id: id,
  crop_name: name,
  crop_group: name,
  variety: null,
  category: 'Rabi crops',
  crop_aliases: aliases,
  season: 'Rabi',
  marketing_year: '2027-28',
  unit: 'INR/quintal',
  msp,
  cost_of_production: cost,
  margin_percent: margin,
  prev_year_label: '2026-27',
  prev_year_msp: prev,
  increase_abs: inc,
  increase_pct: round2((inc / prev) * 100),
  base_year_label: null,
  base_year_msp: null,
  increase_over_base_abs: null,
  increase_over_base_pct: null,
  notes: [],
  published_at: RABI_PUBLISHED,
  validation_status: 'valid',
}));

const rabiDoc: DocSeed = {
  _id: RABI_DOC_ID,
  title: 'Cabinet approves Minimum Support Prices (MSP) for Rabi Crops for Marketing Season 2027-28',
  source_name: 'Press Information Bureau',
  source_url: 'https://www.pib.gov.in/PressReleaseDetail.aspx?PRID=2316956&reg=48&lang=1',
  press_release_id: '2316956',
  file_name: 'MSP_for_Rabi_Crops_for_Marketing_Season_2027-28.pdf',
  season: 'Rabi',
  marketing_year: '2027-28',
  published_at: RABI_PUBLISHED,
  content_hash: '',
  verification_status: 'verified',
  crop_count: rabiRecords.length,
  highlights: {
    crops_covered: 6,
    top_absolute_increases: [
      { crop: 'Safflower', inr_per_quintal: 675 },
      { crop: 'Rapeseed & Mustard', inr_per_quintal: 413 },
      { crop: 'Lentil (Masur)', inr_per_quintal: 390 },
      { crop: 'Barley', inr_per_quintal: 136 },
      { crop: 'Gram', inr_per_quintal: 83 },
      { crop: 'Wheat', inr_per_quintal: 25 },
    ],
    procurement_lmt: {
      wheat: { '2014-15_to_2025-26': 3715, '2004-05_to_2013-14': 2254 },
      rabi_6_crops: { '2014-15_to_2025-26': 3921, '2004-05_to_2013-14': 2302 },
    },
    msp_paid_lakh_crore: {
      wheat: { '2014-15_to_2025-26': 7.31, '2004-05_to_2013-14': 2.56 },
      rabi_6_crops: { '2014-15_to_2025-26': 8.36, '2004-05_to_2013-14': 2.65 },
    },
    cost_definition: 'All paid-out costs (hired labour, machinery, leased land rent, inputs, irrigation, depreciation, interest, fuel/electricity, misc.) plus imputed value of family labour.',
  },
};

export const MSP_SEED: { doc: DocSeed; records: RecSeed[] }[] = [
  { doc: kharifDoc, records: kharifRecords },
  { doc: rabiDoc, records: rabiRecords },
];

/**
 * Standard Canonical Crop Dictionary for Indian Agriculture (MSP Notifications).
 * Maps vernacular and alternate names to canonical identifiers and display names.
 */

export interface CropDefinition {
  canonical_id: string;
  name: string;
  aliases: string[];
}

export const CROP_DICTIONARY: Record<string, CropDefinition> = {
  wheat: {
    canonical_id: "wheat",
    name: "Wheat",
    aliases: ["Gehu", "Kanak", "Godhumai", "Godhuma", "Wheat (Common)"]
  },
  barley: {
    canonical_id: "barley",
    name: "Barley",
    aliases: ["Jau", "Yava"]
  },
  gram: {
    canonical_id: "gram",
    name: "Gram",
    aliases: ["Gram (Chana)", "Chana", "Bengal Gram", "Kadalai"]
  },
  lentil_masur: {
    canonical_id: "lentil_masur",
    name: "Lentil (Masur)",
    aliases: ["Lentil", "Masur", "Masoor", "Lentil (Masoor)"]
  },
  rapeseed_mustard: {
    canonical_id: "rapeseed_mustard",
    name: "Rapeseed & Mustard",
    aliases: ["Mustard", "Rapeseed", "Sarson", "Rai", "Toria", "Rapeseed and Mustard"]
  },
  safflower: {
    canonical_id: "safflower",
    name: "Safflower",
    aliases: ["Kardi", "Kusum", "Kusumba"]
  },
  paddy_common: {
    canonical_id: "paddy_common",
    name: "Paddy (Common)",
    aliases: ["Paddy", "Dhan", "Rice", "Paddy Common"]
  },
  paddy_grade_a: {
    canonical_id: "paddy_grade_a",
    name: "Paddy (Grade A)",
    aliases: ["Paddy Grade A", "Dhan Grade A"]
  },
  jowar_hybrid: {
    canonical_id: "jowar_hybrid",
    name: "Jowar (Hybrid)",
    aliases: ["Jowar Hybrid", "Sorghum Hybrid", "Jowar"]
  },
  jowar_maldandi: {
    canonical_id: "jowar_maldandi",
    name: "Jowar (Maldandi)",
    aliases: ["Jowar Maldandi", "Maldandi"]
  },
  bajra: {
    canonical_id: "bajra",
    name: "Bajra",
    aliases: ["Pearl Millet", "Kambu", "Sajjalu"]
  },
  ragi: {
    canonical_id: "ragi",
    name: "Ragi",
    aliases: ["Finger Millet", "Mandua"]
  },
  maize: {
    canonical_id: "maize",
    name: "Maize",
    aliases: ["Corn", "Makka", "Makai"]
  },
  tur_arhar: {
    canonical_id: "tur_arhar",
    name: "Arhar / Tur",
    aliases: ["Tur", "Arhar", "Red Gram", "Pigeon Pea"]
  },
  moong: {
    canonical_id: "moong",
    name: "Moong",
    aliases: ["Green Gram", "Mung", "Moong (Green Gram)"]
  },
  urad: {
    canonical_id: "urad",
    name: "Urad",
    aliases: ["Black Gram", "Mash", "Urad (Black Gram)"]
  },
  groundnut: {
    canonical_id: "groundnut",
    name: "Groundnut",
    aliases: ["Peanut", "Mungfali", "Groundnut in Shell"]
  },
  sunflower_seed: {
    canonical_id: "sunflower_seed",
    name: "Sunflower Seed",
    aliases: ["Sunflower", "Surajmukhi"]
  },
  soyabean: {
    canonical_id: "soyabean",
    name: "Soyabean (Yellow)",
    aliases: ["Soyabean", "Soybean", "Bhat"]
  },
  sesamum: {
    canonical_id: "sesamum",
    name: "Sesamum",
    aliases: ["Sesame", "Til", "Gingelly"]
  },
  nigerseed: {
    canonical_id: "nigerseed",
    name: "Nigerseed",
    aliases: ["Ramtil", "Niger"]
  },
  cotton_medium: {
    canonical_id: "cotton_medium",
    name: "Cotton (Medium Staple)",
    aliases: ["Cotton Medium Staple", "Kapas Medium"]
  },
  cotton_long: {
    canonical_id: "cotton_long",
    name: "Cotton (Long Staple)",
    aliases: ["Cotton Long Staple", "Kapas Long"]
  },
  jute: {
    canonical_id: "jute",
    name: "Raw Jute",
    aliases: ["Jute", "Patson"]
  },
  copra_milling: {
    canonical_id: "copra_milling",
    name: "Copra (Milling)",
    aliases: ["Copra Milling", "Khopra"]
  },
  copra_ball: {
    canonical_id: "copra_ball",
    name: "Copra (Ball)",
    aliases: ["Copra Ball"]
  }
};

/**
 * Normalizes raw crop name text:
 * - Collapses multi-line strings ("Lentil\n(Masur)" -> "Lentil (Masur)")
 * - Strips numbering ("1. Wheat" -> "Wheat")
 * - Matches canonical IDs and known aliases
 */
export function normalizeCropName(rawText: string): { cropId: string; cropName: string; aliases: string[] } {
  if (!rawText) {
    return { cropId: "unknown", cropName: "Unknown", aliases: [] };
  }

  // Clean whitespace and linebreaks
  let cleaned = rawText
    .replace(/\r?\n+/g, " ")
    .replace(/^\s*\d+[\.\)]\s*/, "") // remove leading number e.g. "1. " or "1) "
    .replace(/\s+/g, " ")
    .trim();

  // Special multi-line or split name handling
  if (/lentil.*masur/i.test(cleaned) || /masur.*lentil/i.test(cleaned)) {
    cleaned = "Lentil (Masur)";
  } else if (/rapeseed.*mustard/i.test(cleaned) || /mustard.*rapeseed/i.test(cleaned)) {
    cleaned = "Rapeseed & Mustard";
  }

  const lower = cleaned.toLowerCase();

  // Direct canonical match
  for (const [cid, def] of Object.entries(CROP_DICTIONARY)) {
    if (def.name.toLowerCase() === lower || cid === lower) {
      return { cropId: def.canonical_id, cropName: def.name, aliases: def.aliases };
    }
  }

  // Alias match
  for (const def of Object.values(CROP_DICTIONARY)) {
    for (const alias of def.aliases) {
      if (alias.toLowerCase() === lower) {
        return { cropId: def.canonical_id, cropName: def.name, aliases: def.aliases };
      }
    }
  }

  // Partial substring match
  for (const def of Object.values(CROP_DICTIONARY)) {
    if (lower.includes(def.name.toLowerCase()) || def.name.toLowerCase().includes(lower)) {
      return { cropId: def.canonical_id, cropName: def.name, aliases: def.aliases };
    }
    for (const alias of def.aliases) {
      if (lower.includes(alias.toLowerCase())) {
        return { cropId: def.canonical_id, cropName: def.name, aliases: def.aliases };
      }
    }
  }

  // Fallback slug
  const fallbackId = lower.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown_crop";
  return { cropId: fallbackId, cropName: cleaned, aliases: [] };
}

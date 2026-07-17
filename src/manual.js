// Manual property input mode — runs the FULL conservative analysis with NO
// network, NO Gemini, NO Supabase. Used by the CLI demo and the /analyze-manual
// endpoint so a human can paste a verified listing + comps and get a decision.
//
// Condition is still derived deterministically from the description text by
// analyzeDeal -> resolveCondition. No AI is required or claimed.
import { analyzeDeal } from "./agents/analyzer.js";

// A comp only counts toward the ARV / 3-comp rule if it is a real SOLD sale with
// the required fields. Active listings, duplicates, or missing data are dropped.
export function validateComps(comps = []) {
  const valid = [];
  const invalid = [];
  const seen = new Set();

  for (const c of comps) {
    const problems = [];
    if (!c || typeof c !== "object") {
      invalid.push({ comp: c, problems: ["not an object"] });
      continue;
    }
    if (!c.address) problems.push("missing address");
    if (!Number.isFinite(Number(c.soldPrice))) problems.push("missing/invalid sold price");
    if (!c.soldDate) problems.push("missing sold date");
    if (!Number.isFinite(Number(c.sqft))) problems.push("missing living area (sqft)");
    if (!c.url && !c.sourceUrl) problems.push("missing source URL");
    if (c.status && /active|for sale|pending/i.test(c.status))
      problems.push("not a sold sale (active/pending)");

    const key = `${(c.address || "").toLowerCase().trim()}|${c.soldPrice}`;
    if (problems.length === 0 && seen.has(key)) problems.push("duplicate comp");

    if (problems.length === 0) {
      seen.add(key);
      valid.push({
        address: c.address,
        soldPrice: Number(c.soldPrice),
        soldDate: c.soldDate,
        sqft: Number(c.sqft),
        beds: c.beds ?? null,
        baths: c.baths ?? null,
        url: c.url || c.sourceUrl,
        pricePerSqft: Number(c.sqft) > 0 ? Math.round(Number(c.soldPrice) / Number(c.sqft)) : null,
        why: c.why || null,
      });
    } else {
      invalid.push({ comp: c, problems });
    }
  }
  return { valid, invalid };
}

// record = {
//   listing: { address, city, price, propertyType, bedrooms, bathrooms,
//              squareFeet, lotSize, yearBuilt, daysOnMarket, description, url },
//   comps: [ { address, soldPrice, soldDate, sqft, url, beds, baths, why } ],
//   classification?: { aduPotential, expansionPotential, extraBedBathPotential,
//                      redFlags, confidence },   // optional value-add hints
//   riskNotes?: string,
//   holdingMonths?: number
// }
export function analyzeManualRecord(record) {
  const { listing = {}, riskNotes = "" } = record;
  const holdingMonths = Number(record.holdingMonths) || 6;

  const { valid, invalid } = validateComps(record.comps || []);

  const classification = {
    aduPotential: "unknown",
    expansionPotential: false,
    extraBedBathPotential: false,
    redFlags: [],
    fixerSignals: [],
    confidence: "medium",
    ...(record.classification || {}),
  };

  const deal = analyzeDeal(
    listing,
    { classification, comps: { comps: valid }, risks: riskNotes },
    holdingMonths
  );

  return { deal, validComps: valid, invalidComps: invalid };
}

// Analysis agent: turns a listing + research into a scored, decided deal.
// Financial math is 100% deterministic (calculator); AI only classifies/summarizes.
import { FlipCalculator } from "../tools/calculator.js";
import { BUY_BOX, MIN_SCORE_TO_PRESENT } from "../config.js";

const calc = new FlipCalculator();

// Hard buy-box gate. Returns {passed, reason}.
export function checkBuyBox(listing) {
  if (!listing || !listing.price) {
    return { passed: false, reason: "Missing price / unparseable listing" };
  }
  if (listing.price < BUY_BOX.minPrice) {
    return { passed: false, reason: `Below price floor ($${listing.price})` };
  }
  if (listing.price > BUY_BOX.maxPrice) {
    return { passed: false, reason: `Above price ceiling ($${listing.price})` };
  }
  const beds = listing.bedrooms;
  if (beds && (beds < BUY_BOX.minBeds || beds > BUY_BOX.maxBeds)) {
    return { passed: false, reason: `Bedrooms ${beds} outside ${BUY_BOX.minBeds}-${BUY_BOX.maxBeds}` };
  }
  const type = (listing.propertyType || "").toLowerCase();
  if (BUY_BOX.excludedTypes.some((t) => type.includes(t))) {
    return { passed: false, reason: `Excluded property type: ${listing.propertyType}` };
  }
  // If a type is stated, it must be an allowed one. Unknown type is allowed through.
  if (type && !BUY_BOX.allowedTypes.some((t) => type.includes(t))) {
    return { passed: false, reason: `Property type not in buy box: ${listing.propertyType}` };
  }
  return { passed: true, reason: null };
}

// Derive ARV low/expected/high from comps (falls back gracefully with few comps).
export function arvFromComps(comps) {
  const prices = (comps || [])
    .map((c) => Number(c.soldPrice))
    .filter((p) => Number.isFinite(p) && p > 100000)
    .sort((a, b) => a - b);

  if (prices.length === 0) return null;
  if (prices.length === 1) {
    const p = prices[0];
    return { low: Math.round(p * 0.9), expected: p, high: Math.round(p * 1.1), count: 1 };
  }
  const median = prices[Math.floor(prices.length / 2)];
  return {
    low: prices[0],
    expected: median,
    high: prices[prices.length - 1],
    count: prices.length,
  };
}

function confidenceFrom(compCount, classificationConfidence) {
  if (compCount >= 5 && classificationConfidence === "high") return "High confidence";
  if (compCount >= 3) return "Medium confidence";
  return "Low confidence";
}

function demandForCity(city) {
  // Coarse resale-demand prior. Refine later from sales velocity data.
  const s = (city || "").toLowerCase();
  if (s.includes("sunnyvale") || s.includes("san mateo")) return "high";
  return "medium";
}

// Full analysis for one buy-box-passing listing.
// research = { classification, comps, risks }
export function analyzeDeal(listing, research, holdingMonths = 6) {
  const { classification, comps, risks } = research;

  const arv = arvFromComps(comps?.comps || []);
  if (!arv) {
    return {
      qualified: false,
      reason: "No comparable sales found — ARV unsupported",
      address: listing.address,
    };
  }

  const scope = classification.renovationScope || "moderate";
  const reno = calc.renovationEstimate(scope, listing.squareFeet || 0);

  const scenarios = calc.scenarios({
    purchasePrice: listing.price,
    arv,
    reno,
    holdingMonths,
  });

  const baseCost = calc.totalCost({
    purchasePrice: listing.price,
    renovation: reno.expected,
    holdingMonths,
    arv: arv.expected,
  });
  const cashRequired = calc.cashInvested({
    purchasePrice: listing.price,
    costBreakdown: baseCost,
  });
  const returnOnCash =
    cashRequired > 0 ? round1((scenarios.base.netProfit / cashRequired) * 100) : 0;

  const mao = calc.maximumAllowableOffer({
    conservativeArv: arv.low,
    expectedReno: reno.expected,
    holdingMonths,
  });

  const riskLevel =
    (classification.redFlags || []).length >= 2
      ? "high"
      : (classification.redFlags || []).length === 1
      ? "medium"
      : "low";

  const scoring = calc.scoreDeal({
    marginOnCost: scenarios.base.marginOnCost,
    compCount: arv.count,
    scope,
    demand: demandForCity(listing.city),
    aduPotential: classification.aduPotential,
    expansionPotential: classification.expansionPotential,
    extraBedBathPotential: classification.extraBedBathPotential,
    riskLevel,
  });

  const confidence = confidenceFrom(arv.count, classification.confidence);

  // A deal only qualifies if it clears the score AND is profitable under the
  // CONSERVATIVE scenario — never on optimism alone.
  const qualified =
    scoring.score >= MIN_SCORE_TO_PRESENT && scenarios.conservative.meetsMinimum;

  const recommendation = qualified
    ? scenarios.conservative.meetsMinimum
      ? "Contact listing agent / request disclosures"
      : "Monitor for price reduction"
    : "Reject";

  return {
    qualified,
    address: listing.address,
    city: listing.city,
    url: listing.url,
    price: listing.price,
    squareFeet: listing.squareFeet,
    beds: listing.bedrooms,
    baths: listing.bathrooms,
    scope,
    reno,
    arv,
    costBreakdown: baseCost,
    scenarios,
    base: scenarios.base,
    conservative: scenarios.conservative,
    optimistic: scenarios.optimistic,
    cashRequired,
    returnOnCash,
    mao,
    score: scoring.score,
    scoreParts: scoring.parts,
    confidence,
    riskLevel,
    classification,
    comps: comps?.comps || [],
    risks,
    recommendation,
    nextStep: qualified
      ? "Verify condition, comps, and occupancy before submitting an offer near the MAO."
      : "Store internally; no action.",
  };
}

function round1(n) {
  return Math.round((n || 0) * 10) / 10;
}

// Central configuration for the Flip Scout agent.
// Change these to adjust the buy box, target areas, and financial assumptions.
// No AI is involved here — these are the hard rules the agent obeys.

export const TARGET_AREAS = {
  san_francisco: {
    neighborhoods: [
      "Bayview",
      "Sunset",
      "Richmond",
      "Bernal Heights",
      "Excelsior",
      "Mission District",
    ],
  },
  san_mateo: {
    neighborhoods: ["San Mateo"],
  },
  sunnyvale: {
    neighborhoods: ["Sunnyvale"],
  },
};

export const BUY_BOX = {
  minPrice: 700000,
  maxPrice: 2500000,
  minBeds: 2,
  maxBeds: 5,
  // property types we accept (matched loosely against the listing type text)
  allowedTypes: [
    "single family",
    "single-family",
    "sfr",
    "duplex",
    "triplex",
    "fourplex",
    "multi-family",
    "multifamily",
    "townhouse",
  ],
  // property types we reject outright
  excludedTypes: [
    "manufactured",
    "mobile",
    "vacant land",
    "land",
    "commercial",
    "apartment building",
  ],
  fixerKeywords: [
    "fixer",
    "fixer-upper",
    "needs work",
    "contractor special",
    "investor special",
    "as-is",
    "as is",
    "estate sale",
    "probate",
    "trust sale",
    "original condition",
    "outdated",
    "deferred maintenance",
    "fire damage",
    "water damage",
    "cosmetic fixer",
    "partial renovation",
    "handyman special",
    "bring your contractor",
    "opportunity property",
    "value-add",
    "value add",
    "diamond in the rough",
    "needs tlc",
    "sweat equity",
  ],
};

// Deterministic financial assumptions. All money math uses these — never the AI.
export const FINANCIAL = {
  buyerClosingPct: 0.02, // 2% of purchase price
  financingPct: 0.015, // 1.5% loan origination/points on purchase price
  annualInterest: 0.08, // 8% annual on a 70% LTV loan
  loanToValue: 0.7,
  propertyTaxAnnualPct: 0.012, // ~1.2% annual
  monthlyInsurance: 200,
  monthlyUtilities: 300,
  monthlyMaintenance: 200,
  sellingCostPct: 0.07, // 6% commission + ~1% other selling closing costs, on ARV
  permitFees: 10000,
  baseContingency: 0.15, // 15% of renovation
  minProfitDollars: 75000,
  minMarginPct: 0.2, // 20% margin on total cost
  riskBufferPct: 0.05, // 5% of ARV extra buffer inside the MAO
};

// Renovation cost per square foot by scope. $300–$500/sqft is reserved for the
// heaviest gut/structural work per the buy box; lighter scopes cost far less.
export const RENOVATION_RATES = {
  cosmetic: { low: 30, expected: 55, high: 80 },
  moderate: { low: 90, expected: 130, high: 180 },
  heavy: { low: 200, expected: 300, high: 500 },
};

// Contingency escalates with renovation risk.
export const CONTINGENCY_BY_SCOPE = {
  cosmetic: 0.1,
  moderate: 0.15,
  heavy: 0.2,
};

// Only deals scoring at or above this (on the 1–10 scale) are shown to Juan.
export const MIN_SCORE_TO_PRESENT = 8.0;

export const DATA_DISCLAIMER =
  "MLS access was not available. This analysis is based on publicly accessible listing and property data. All figures are estimates and must be verified before making any offer.";

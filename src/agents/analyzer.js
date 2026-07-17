// Analysis agent: turns a listing + research into a scored, decided deal.
// Financial math is 100% deterministic (calculator); AI only classifies/summarizes.
import { FlipCalculator } from "../tools/calculator.js";
import { resolveCondition } from "../tools/condition.js";
import { BUY_BOX, MIN_SCORE_TO_PRESENT, FINANCIAL } from "../config.js";

const calc = new FlipCalculator();

// Reliable-ARV threshold: qualification requires at least this many comps.
const MIN_RELIABLE_COMPS = 3;

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
  const { classification = {}, comps, risks } = research;

  // --- Condition strategy (Juan's "ugly but fixable" mandate) -------------
  // Build evidence from listing text + the AI's distilled red flags. We do NOT
  // feed the exploratory risk narrative here (it names hazards generically and
  // would false-positive). Condition drives renovation scope and gating.
  const evidence = [
    listing.description || "",
    ...(classification.redFlags || []),
    ...(classification.fixerSignals || []),
  ].join(" . ");
  const condition = resolveCondition(evidence, classification);
  const scope = condition.likelyRenovationScope;

  const arv = arvFromComps(comps?.comps || []);

  // If we cannot value the property at all, we still surface the condition read
  // so the dashboard can categorize it, but it cannot qualify.
  if (!arv) {
    return baseResult({
      listing,
      condition,
      scope,
      classification,
      comps,
      risks,
      qualified: false,
      conditionGate: condition.criticalRisk
        ? "blocked_risk"
        : condition.category === "extreme"
        ? "reject_extreme"
        : "ok",
      reason: "No comparable sales found — ARV unsupported",
      strategyFit: "Reject",
      recommendation: "Reject",
    });
  }

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

  const riskLevel = condition.criticalRisk
    ? "high"
    : (classification.redFlags || []).length >= 2
    ? "high"
    : (classification.redFlags || []).length === 1
    ? "medium"
    : "low";

  const scoring = calc.scoreDeal({
    marginOnCost: scenarios.base.marginOnCost,
    compCount: arv.count,
    conditionFitScore: condition.fitScore, // condition-fit drives this dimension
    demand: demandForCity(listing.city),
    aduPotential: classification.aduPotential,
    expansionPotential: classification.expansionPotential,
    extraBedBathPotential: classification.extraBedBathPotential,
    riskLevel,
  });

  const confidence = confidenceFrom(arv.count, condition.conditionConfidence);
  const conservativePasses = scenarios.conservative.meetsMinimum;
  const reliableComps = arv.count >= MIN_RELIABLE_COMPS;

  // --- Decision gates (order matters) -------------------------------------
  // Condition-fit never overrides a financial or critical-risk failure.
  let conditionGate = "ok";
  let reason = null;

  if (condition.criticalRisk) {
    conditionGate = "blocked_risk";
    reason = `Critical unresolved risk: ${condition.criticalRiskSignals.join(", ")}`;
  } else if (condition.category === "extreme") {
    conditionGate = "reject_extreme";
    reason = "Condition too severe / renovation and timeline risk too high.";
  } else if (condition.category === "turnkey" && !conservativePasses) {
    // Turnkey is a DEFAULT reject only when there is no discount. A turnkey home
    // with a big enough discount that the conservative scenario still passes is
    // NOT auto-rejected — it goes on to be judged on the numbers (test 8).
    conditionGate = "reject_turnkey";
    reason = "Too turnkey / insufficient value-add potential.";
  } else if (!conservativePasses) {
    reason = `Insufficient spread — conservative net profit $${scenarios.conservative.netProfit.toLocaleString()} / margin ${scenarios.conservative.marginOnCost}% below minimum ($${FINANCIAL.minProfitDollars.toLocaleString()} / ${FINANCIAL.minMarginPct * 100}%).`;
  } else if (!reliableComps) {
    reason = `ARV unsupported — only ${arv.count} comparable sale(s), need ${MIN_RELIABLE_COMPS}+.`;
  } else if (scoring.score < MIN_SCORE_TO_PRESENT) {
    reason = `Deal score ${scoring.score} below ${MIN_SCORE_TO_PRESENT}.`;
  }

  const qualified =
    conditionGate === "ok" &&
    conservativePasses &&
    reliableComps &&
    scoring.score >= MIN_SCORE_TO_PRESENT;

  const strategyFit = deriveStrategyFit({
    qualified,
    conditionGate,
    category: condition.category,
    fitScore: condition.fitScore,
    conservativePasses,
  });

  let recommendation;
  if (qualified) {
    recommendation = "Contact listing agent / request disclosures";
  } else if (conditionGate !== "ok") {
    recommendation = "Reject";
  } else if (condition.fitScore >= 12 && !conservativePasses) {
    recommendation = "Monitor for price reduction";
  } else {
    recommendation = "Reject";
  }

  return baseResult({
    listing,
    condition,
    scope,
    classification,
    comps,
    risks,
    arv,
    reno,
    scenarios,
    baseCost,
    cashRequired,
    returnOnCash,
    mao,
    scoring,
    confidence,
    riskLevel,
    qualified,
    conditionGate,
    reason,
    strategyFit,
    recommendation,
  });
}

// Strategy-fit label per Juan's summary requirement.
function deriveStrategyFit({ qualified, conditionGate, category, fitScore, conservativePasses }) {
  if (conditionGate !== "ok") return "Reject";
  if (qualified) return category === "middle" ? "Strong" : "Moderate";
  if (fitScore >= 12 && !conservativePasses) return "Weak"; // great house, wrong price
  if (fitScore >= 7) return "Weak";
  return "Reject";
}

function strategyFitReason(condition, qualified, reason) {
  if (qualified) {
    return `${condition.categoryLabel}. Ugly/outdated enough to create value, renovation is ${condition.likelyRenovationScope}, timeline ~${condition.estimatedTimeline}, and the conservative scenario clears Juan's minimums.`;
  }
  return `${condition.categoryLabel}. Does not fit: ${reason || "financial or risk criteria not met"}.`;
}

// Assemble the analysis object with all new condition output fields.
function baseResult(o) {
  const c = o.condition;
  const qualified = o.qualified;
  return {
    qualified,
    address: o.listing.address,
    city: o.listing.city,
    url: o.listing.url,
    price: o.listing.price,
    squareFeet: o.listing.squareFeet,
    beds: o.listing.bedrooms,
    baths: o.listing.bathrooms,

    // --- Condition fields (NEW) ---
    conditionCategory: c.categoryLabel,
    conditionCategoryKey: c.category,
    conditionFitScore: c.fitScore,
    strategyFit: o.strategyFit,
    strategyFitReason: strategyFitReason(c, qualified, o.reason),
    turnkeySignals: c.turnkeySignals,
    uglyFixableSignals: c.uglyFixableSignals,
    extremeRiskSignals: c.extremeRiskSignals,
    likelyRenovationScope: c.likelyRenovationScope,
    estimatedTimeline: c.estimatedTimeline,
    conditionConfidence: c.conditionConfidence,
    observationSource: c.observationSource,
    requiredPhysicalVerification: c.requiredPhysicalVerification,
    conditionGate: o.conditionGate,
    criticalRisk: c.criticalRisk,
    needsPhotoReview:
      c.observationSource.startsWith("Unknown") || c.conditionConfidence === "low",
    needsInspection: ["middle", "heavy", "extreme"].includes(c.category),

    // --- Financial fields ---
    scope: o.scope,
    reno: o.reno,
    arv: o.arv,
    costBreakdown: o.baseCost,
    scenarios: o.scenarios,
    base: o.scenarios?.base,
    conservative: o.scenarios?.conservative,
    optimistic: o.scenarios?.optimistic,
    cashRequired: o.cashRequired,
    returnOnCash: o.returnOnCash,
    mao: o.mao,
    score: o.scoring?.score ?? 0,
    scoreParts: o.scoring?.parts,
    confidence: o.confidence,
    riskLevel: o.riskLevel,

    classification: o.classification,
    comps: o.comps?.comps || [],
    risks: o.risks,
    reason: o.reason,
    recommendation: o.recommendation,
    nextStep: qualified
      ? "Verify condition, comps, and occupancy before submitting an offer near the MAO."
      : "Store internally; no action.",
  };
}

function round1(n) {
  return Math.round((n || 0) * 10) / 10;
}

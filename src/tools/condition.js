// Condition strategy engine (Juan's "ugly but fixable" mandate).
//
// Deterministic keyword/signal classifier — no AI, so it is fully unit-testable.
// The AI (researcher.classifyProperty) produces a supplementary hint, but the
// category, condition-fit score, and gating decisions are decided here from
// evidence text (listing description + any red flags / records notes).
//
// IMPORTANT: we do NOT perform live photo analysis. Signals found in listing
// TEXT are labeled "Confirmed from listing text". Anything not stated is
// "Requires inspection" / "Unknown". We never label a defect as visually
// confirmed from photos.

export const CONDITION_CATEGORIES = {
  turnkey: "Turnkey / too nice",
  light_cosmetic: "Light cosmetic",
  middle: "Middle condition — ugly but fixable (priority target)",
  heavy: "Heavy but possible",
  extreme: "Extreme / too risky",
  unknown: "Unknown condition",
};

// --- Signal dictionaries ---------------------------------------------------

// Fully renovated / move-in-ready — usually priced with the renovation premium.
export const TURNKEY_SIGNALS = [
  "fully remodeled",
  "fully renovated",
  "newly renovated",
  "recently renovated",
  "completely renovated",
  "remodeled throughout",
  "designer finish",
  "designer kitchen",
  "move-in ready",
  "move in ready",
  "turnkey",
  "turn-key",
  "luxury renovation",
  "luxury finish",
  "new kitchen and bath",
  "new bathrooms",
  "new roof",
  "new electrical",
  "new plumbing",
  "new hvac",
  "new systems throughout",
  "professionally staged",
  "upgraded throughout",
  "recently upgraded throughout",
];

// The target middle band: outdated, worn, cluttered, partial — but usable.
export const UGLY_FIXABLE_SIGNALS = [
  "original kitchen",
  "original bath",
  "original condition",
  "dated interior",
  "dated finish",
  "dated fixture",
  "dated paint",
  "old kitchen",
  "old bathroom",
  "old flooring",
  "old carpet",
  "old fixture",
  "old cabinet",
  "worn",
  "deferred maintenance",
  "poor photo",
  "poorly photographed",
  "poor staging",
  "poorly staged",
  "cluttered",
  "clutter",
  "peeling paint",
  "poor curb appeal",
  "overgrown",
  "dark room",
  "partial renovation",
  "partially renovated",
  "unattractive",
  "functional but",
  "needs updating",
  "needs update",
  "needs tlc",
  "tlc",
  "fixer",
  "outdated",
  "estate sale",
  "probate",
  "trust sale",
  "handyman",
  "as-is",
  "as is",
  "bring your contractor",
  "needs work",
  "cosmetic and moderate",
];

// Pure cosmetic-only refresh (no moderate/original-kitchen work implied).
export const LIGHT_COSMETIC_SIGNALS = [
  "paint",
  "flooring",
  "fixtures",
  "landscaping",
  "minor kitchen",
  "minor bath",
  "curb appeal",
  "cosmetic refresh",
  "cosmetic updates",
  "refresh",
];

// Big-but-doable jobs: full kit/bath, major systems, roof, layout.
export const HEAVY_SIGNALS = [
  "full kitchen and bath replacement",
  "major electrical",
  "major plumbing",
  "rewire",
  "re-pipe",
  "repipe",
  "roof replacement",
  "replace roof",
  "significant layout",
  "layout change",
  "extensive deferred",
  "some structural",
  "structural uncertainty",
  "major systems",
  "gut renovation",
];

// Deal-killers unless Juan explicitly approves.
export const EXTREME_RISK_SIGNALS = [
  "foundation failure",
  "major foundation",
  "failing foundation",
  "severe fire",
  "fire damage",
  "fire-damaged",
  "fire damaged",
  "burned",
  "severe water",
  "major water damage",
  "extensive water",
  "extensive mold",
  "major mold",
  "red-tag",
  "red tag",
  "collapse",
  "structural rebuild",
  "reconstruction",
  "full reconstruction",
  "teardown",
  "tear down",
  "gut to studs",
  "condemned",
  "uninhabitable",
  "unsafe",
  "environmental contamination",
  "extensive unpermitted",
];

// The subset of extreme signals that constitute a CRITICAL unresolved risk
// (safety/structural) and hard-block a deal, separate from "too severe" scope.
export const CRITICAL_RISK_SIGNALS = [
  "foundation failure",
  "major foundation",
  "failing foundation",
  "red-tag",
  "red tag",
  "collapse",
  "condemned",
  "uninhabitable",
  "unsafe",
  "structural rebuild",
];

function scan(text, signals) {
  return signals.filter((s) => text.includes(s));
}

// Map a category to a renovation scope the calculator understands.
export function renovationScopeForCategory(category) {
  switch (category) {
    case "turnkey":
    case "light_cosmetic":
      return "cosmetic";
    case "middle":
      return "moderate";
    case "heavy":
    case "extreme":
      return "heavy";
    default:
      return "moderate";
  }
}

function timelineForCategory(category) {
  switch (category) {
    case "turnkey":
    case "light_cosmetic":
      return "2-4 months";
    case "middle":
      return "4-6 months";
    case "heavy":
      return "6-9 months";
    case "extreme":
      return "9+ months / uncertain";
    default:
      return "unknown";
  }
}

function verificationForCategory(category) {
  switch (category) {
    case "extreme":
      return ["Full structural engineering assessment", "Environmental / hazard report"];
    case "heavy":
      return ["Foundation & structural inspection", "Roof & systems inspection", "Permit history review"];
    case "middle":
      return ["General home inspection", "Roof & systems check", "Permit history review"];
    case "light_cosmetic":
    case "turnkey":
      return ["Verify permits for claimed upgrades"];
    default:
      return ["General home inspection"];
  }
}

// Condition-fit score (0-15). Ranges follow Juan's mandate exactly.
function conditionFitScore(category, counts) {
  switch (category) {
    case "turnkey":
      return 2; // 0-3
    case "light_cosmetic":
      return clamp(7 + (counts.light - 1), 7, 11); // 7-11
    case "middle":
      return clamp(12 + (counts.middle - 1), 12, 15); // 12-15
    case "heavy":
      return clamp(9 - (counts.heavy - 1), 5, 10); // 5-10
    case "extreme":
      return counts.critical > 0 ? 0 : 2; // 0-4
    default:
      return 5; // unknown → neutral-low
  }
}

// Main entry. `evidence` = free text (listing description + record notes).
// `hint` (optional) = AI classification { renovationScope, redFlags, confidence,
// aduPotential, ... } used only to enrich, never to override text evidence.
export function resolveCondition(evidence, hint = {}) {
  const text = String(evidence || "").toLowerCase();

  const turnkey = scan(text, TURNKEY_SIGNALS);
  const middle = scan(text, UGLY_FIXABLE_SIGNALS);
  const light = scan(text, LIGHT_COSMETIC_SIGNALS);
  const heavy = scan(text, HEAVY_SIGNALS);
  const extreme = scan(text, EXTREME_RISK_SIGNALS);
  const critical = scan(text, CRITICAL_RISK_SIGNALS);

  const counts = {
    turnkey: turnkey.length,
    middle: middle.length,
    light: light.length,
    heavy: heavy.length,
    extreme: extreme.length,
    critical: critical.length,
  };

  // Categorization precedence: safety first, then scope severity.
  let category;
  if (extreme.length > 0) category = "extreme";
  else if (heavy.length > 0) category = "heavy";
  else if (turnkey.length > 0 && middle.length === 0) category = "turnkey";
  else if (middle.length > 0) category = "middle";
  else if (light.length > 0) category = "light_cosmetic";
  else category = "unknown";

  const criticalRisk = critical.length > 0;
  const fitScore = conditionFitScore(category, counts);

  // Observation source label. Text-derived signals are "Confirmed from listing
  // text". If nothing was found in text, we do NOT guess from photos.
  const hasTextSignal =
    turnkey.length + middle.length + light.length + heavy.length + extreme.length > 0;
  const observationSource = hasTextSignal
    ? "Confirmed from listing text"
    : "Unknown — requires inspection";

  // Confidence: prefer the AI hint but cap at "medium" when we only have text.
  let conditionConfidence = hint.confidence || (hasTextSignal ? "medium" : "low");
  if (conditionConfidence === "high" && !hint.photosAnalyzed) {
    conditionConfidence = "medium"; // never claim high without verified evidence
  }

  return {
    category, // machine key
    categoryLabel: CONDITION_CATEGORIES[category],
    fitScore, // 0-15
    criticalRisk,
    criticalRiskSignals: critical,
    turnkeySignals: turnkey,
    uglyFixableSignals: middle,
    extremeRiskSignals: extreme,
    heavySignals: heavy,
    lightCosmeticSignals: light,
    likelyRenovationScope: renovationScopeForCategory(category),
    estimatedTimeline: timelineForCategory(category),
    conditionConfidence,
    observationSource,
    requiredPhysicalVerification: verificationForCategory(category),
  };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

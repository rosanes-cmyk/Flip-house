// Condition-strategy tests (Juan's "ugly but fixable" mandate). All deterministic,
// no network. Covers the condition classifier and the 10 required scenario fixtures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCondition } from "../src/tools/condition.js";
import { analyzeDeal } from "../src/agents/analyzer.js";

// --- helpers ---------------------------------------------------------------
function listing(over = {}) {
  return {
    address: "1 Test St",
    city: "San Mateo",
    price: 780000,
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1400,
    description: "",
    url: "http://example.com/listing",
    ...over,
  };
}
function comps(prices) {
  return { comps: prices.map((soldPrice) => ({ soldPrice })) };
}
function classif(over = {}) {
  return {
    aduPotential: "unknown",
    expansionPotential: false,
    extraBedBathPotential: false,
    redFlags: [],
    fixerSignals: [],
    confidence: "medium",
    ...over,
  };
}
function analyze(l, c, cmp) {
  return analyzeDeal(l, { classification: c, comps: cmp, risks: "" });
}

// --- classifier unit checks ------------------------------------------------
test("classifier: turnkey detected", () => {
  const c = resolveCondition("Fully remodeled, move-in ready, designer finishes");
  assert.equal(c.category, "turnkey");
  assert.ok(c.fitScore <= 3);
});

test("classifier: middle band is the priority target with high fit", () => {
  const c = resolveCondition("Original kitchen, dated interior, old flooring, worn, deferred maintenance");
  assert.equal(c.category, "middle");
  assert.ok(c.fitScore >= 12);
});

test("classifier: foundation failure is critical + extreme", () => {
  const c = resolveCondition("Major foundation failure, needs structural rebuild");
  assert.equal(c.category, "extreme");
  assert.equal(c.criticalRisk, true);
});

test("classifier never claims photo confirmation", () => {
  const c = resolveCondition("Original kitchen, dated");
  assert.equal(c.observationSource, "Confirmed from listing text");
  assert.equal(/photo/i.test(c.observationSource), false);
});

// --- 10 required scenario fixtures ----------------------------------------

// 1. Fully renovated turnkey with weak upside -> reject/deprioritize.
test("fixture 1: turnkey + weak upside -> reject (too turnkey)", () => {
  const d = analyze(
    listing({
      price: 1500000,
      description:
        "Fully remodeled with designer finishes, new kitchen and bathrooms, move-in ready, professionally staged. New roof and HVAC.",
    }),
    classif(),
    comps([1450000, 1500000, 1550000])
  );
  assert.equal(d.qualified, false);
  assert.equal(d.conditionGate, "reject_turnkey");
  assert.match(d.reason, /turnkey/i);
  assert.equal(d.strategyFit, "Reject");
});

// 2. Dated but structurally usable, original kitchen/bath -> high condition-fit.
test("fixture 2: dated & usable -> high condition-fit", () => {
  const d = analyze(
    listing({
      description:
        "Original kitchen and bathrooms, dated interior, old flooring, worn but structurally usable. Deferred maintenance.",
    }),
    classif(),
    comps([1550000, 1600000, 1650000])
  );
  assert.equal(d.conditionCategoryKey, "middle");
  assert.ok(d.conditionFitScore >= 12);
});

// 3. Poorly staged, cluttered, cosmetic + moderate -> priority target if finances pass.
test("fixture 3: cluttered middle + good finances -> qualifies (Strong)", () => {
  const d = analyze(
    listing({
      description:
        "Cluttered rooms, poorly staged, poor curb appeal, old fixtures, dated paint. Functional but unattractive; needs cosmetic and moderate updates.",
    }),
    classif({ aduPotential: "moderate", expansionPotential: true }),
    comps([1550000, 1600000, 1650000])
  );
  assert.equal(d.conditionCategoryKey, "middle");
  assert.equal(d.qualified, true);
  assert.equal(d.strategyFit, "Strong");
});

// 4. Fire-damaged requiring reconstruction -> reject for extreme condition.
test("fixture 4: fire + reconstruction -> reject (too severe)", () => {
  const d = analyze(
    listing({
      price: 900000,
      description: "Significant fire damage; requires reconstruction. Sold as-is.",
    }),
    classif(),
    comps([1500000, 1550000, 1600000])
  );
  assert.equal(d.qualified, false);
  assert.equal(d.conditionGate, "reject_extreme");
  assert.match(d.reason, /too severe/i);
});

// 5. Major foundation problems -> blocked by critical risk.
test("fixture 5: foundation failure -> blocked (critical risk)", () => {
  const d = analyze(
    listing({
      price: 900000,
      description: "Major foundation failure; needs structural rebuild.",
    }),
    classif(),
    comps([1500000, 1550000, 1600000])
  );
  assert.equal(d.qualified, false);
  assert.equal(d.conditionGate, "blocked_risk");
  assert.equal(d.criticalRisk, true);
  assert.match(d.reason, /critical/i);
});

// 6. Partially renovated with remaining value-add -> possible middle target.
test("fixture 6: partial renovation -> middle target", () => {
  const d = analyze(
    listing({
      description:
        "Partially renovated: kitchen updated but original bathrooms and old flooring remain. Value-add opportunity, some deferred maintenance.",
    }),
    classif(),
    comps([1550000, 1600000, 1650000])
  );
  assert.equal(d.conditionCategoryKey, "middle");
  assert.ok(d.conditionFitScore >= 12);
});

// 7. Ugly but overpriced -> reject for insufficient spread.
test("fixture 7: ugly but overpriced -> reject (insufficient spread)", () => {
  const d = analyze(
    listing({
      price: 1400000,
      description: "Original kitchen, dated, worn, deferred maintenance.",
    }),
    classif(),
    comps([1450000, 1500000, 1550000])
  );
  assert.equal(d.qualified, false);
  assert.equal(d.conditionGate, "ok"); // not a condition reject — a money reject
  assert.match(d.reason, /spread/i);
});

// 8. Nice-looking house with a major price discount -> analyze financially,
//    do NOT auto-reject just because it looks good.
test("fixture 8: nice house + big discount -> analyzed, not rejected for looks", () => {
  const d = analyze(
    listing({
      price: 780000,
      description: "Recently renovated, move-in ready, new kitchen and bathrooms.",
    }),
    classif({ aduPotential: "moderate", expansionPotential: true }),
    comps([1550000, 1600000, 1650000])
  );
  // conservative scenario passes thanks to the discount, so the turnkey default
  // reject does NOT fire — it is judged on the numbers instead.
  assert.equal(d.conditionGate, "ok");
  assert.ok(d.base.netProfit > 0);
  assert.ok(!/turnkey/i.test(d.reason || ""));
});

// 9. Ugly property profitable only in the optimistic scenario -> reject.
test("fixture 9: profitable only optimistic -> reject", () => {
  const d = analyze(
    listing({
      price: 1200000,
      description: "Original kitchen, dated interior, worn, deferred maintenance.",
    }),
    classif(),
    comps([1400000, 1500000, 1600000])
  );
  assert.equal(d.qualified, false);
  assert.equal(d.conditionGate, "ok");
  assert.equal(d.conservative.meetsMinimum, false);
});

// 10. Middle-condition with strong conservative profit + reliable comps -> qualify.
test("fixture 10: strong middle deal -> qualifies for human review", () => {
  const d = analyze(
    listing({
      price: 780000,
      description:
        "Original kitchen and bathrooms, dated interior, old flooring, worn carpet throughout, deferred maintenance. Structurally sound.",
    }),
    classif({ aduPotential: "moderate", expansionPotential: true }),
    comps([1550000, 1600000, 1650000])
  );
  assert.equal(d.conditionCategoryKey, "middle");
  assert.equal(d.qualified, true);
  assert.ok(d.score >= 8);
  assert.equal(d.strategyFit, "Strong");
  assert.equal(d.conservative.meetsMinimum, true);
});

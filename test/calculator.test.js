// Deterministic checks for the money engine. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { FlipCalculator } from "../src/tools/calculator.js";
import { checkBuyBox, arvFromComps } from "../src/agents/analyzer.js";

const calc = new FlipCalculator();

test("renovation estimate scales with sqft and scope", () => {
  const cosmetic = calc.renovationEstimate("cosmetic", 1000);
  const heavy = calc.renovationEstimate("heavy", 1000);
  assert.ok(heavy.expected > cosmetic.expected);
  assert.equal(cosmetic.expected, 55000);
});

test("total cost includes all major categories", () => {
  const c = calc.totalCost({
    purchasePrice: 900000,
    renovation: 180000,
    holdingMonths: 6,
    arv: 1350000,
  });
  assert.ok(c.buyerClosing > 0);
  assert.ok(c.holding.total > 0);
  assert.ok(c.sellingCosts > 0);
  // total must exceed purchase + reno (proves it isn't the naive formula)
  assert.ok(c.totalProjectCost > 900000 + 180000);
});

test("profit and margins compute correctly", () => {
  const p = calc.profit(1350000, 1200000);
  assert.equal(p.netProfit, 150000);
  assert.equal(p.marginOnCost, 12.5);
});

test("MAO is conservative (below ARV minus reno)", () => {
  const mao = calc.maximumAllowableOffer({
    conservativeArv: 1350000,
    expectedReno: 180000,
    holdingMonths: 6,
  });
  assert.ok(mao > 0);
  assert.ok(mao < 1350000 - 180000);
});

test("score maps to 1-10 and caps at 10", () => {
  const s = calc.scoreDeal({
    marginOnCost: 35,
    compCount: 6,
    conditionFitScore: 15,
    demand: "high",
    aduPotential: "strong",
    expansionPotential: true,
    extraBedBathPotential: true,
    riskLevel: "low",
  });
  assert.ok(s.score <= 10);
  assert.ok(s.score >= 9);
  assert.equal(s.parts.conditionFit, 15);
});

test("buy box rejects out-of-range price", () => {
  assert.equal(checkBuyBox({ price: 500000 }).passed, false);
  assert.equal(checkBuyBox({ price: 3000000 }).passed, false);
  assert.equal(
    checkBuyBox({ price: 900000, bedrooms: 3, propertyType: "Single Family" }).passed,
    true
  );
});

test("buy box rejects excluded property types", () => {
  assert.equal(
    checkBuyBox({ price: 900000, propertyType: "Manufactured Home" }).passed,
    false
  );
});

test("ARV from comps uses median and needs data", () => {
  assert.equal(arvFromComps([]), null);
  const arv = arvFromComps([
    { soldPrice: 1200000 },
    { soldPrice: 1350000 },
    { soldPrice: 1500000 },
  ]);
  assert.equal(arv.expected, 1350000);
  assert.equal(arv.count, 3);
});

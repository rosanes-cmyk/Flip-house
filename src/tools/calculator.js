// Deterministic financial engine. NO AI here — pure math so numbers are auditable.
import {
  FINANCIAL,
  RENOVATION_RATES,
  CONTINGENCY_BY_SCOPE,
} from "../config.js";

export class FlipCalculator {
  constructor(config = FINANCIAL) {
    this.c = config;
  }

  // Renovation cost range for a scope + living area.
  renovationEstimate(scope, sqft) {
    const rate = RENOVATION_RATES[scope] || RENOVATION_RATES.moderate;
    const area = sqft && sqft > 0 ? sqft : 0;
    return {
      scope,
      perSqft: rate.expected,
      low: Math.round(rate.low * area),
      expected: Math.round(rate.expected * area),
      high: Math.round(rate.high * area),
    };
  }

  // Full project cost. Returns every line item plus the total.
  totalCost({ purchasePrice, renovation, holdingMonths, arv, contingencyPct }) {
    const c = this.c;
    const cont = contingencyPct ?? c.baseContingency;

    const buyerClosing = purchasePrice * c.buyerClosingPct;
    const financingCost = purchasePrice * c.financingPct;

    const loan = purchasePrice * c.loanToValue;
    const interest = loan * (c.annualInterest / 12) * holdingMonths;
    const taxes = ((purchasePrice * c.propertyTaxAnnualPct) / 12) * holdingMonths;
    const insurance = c.monthlyInsurance * holdingMonths;
    const utilities = c.monthlyUtilities * holdingMonths;
    const maintenance = c.monthlyMaintenance * holdingMonths;
    const holding = interest + taxes + insurance + utilities + maintenance;

    const contingency = renovation * cont;
    const sellingCosts = arv * c.sellingCostPct;

    const total =
      purchasePrice +
      buyerClosing +
      financingCost +
      renovation +
      contingency +
      c.permitFees +
      holding +
      sellingCosts;

    return {
      purchasePrice: round(purchasePrice),
      buyerClosing: round(buyerClosing),
      financingCost: round(financingCost),
      renovation: round(renovation),
      contingency: round(contingency),
      permitFees: c.permitFees,
      holding: {
        interest: round(interest),
        taxes: round(taxes),
        insurance: round(insurance),
        utilities: round(utilities),
        maintenance: round(maintenance),
        total: round(holding),
      },
      sellingCosts: round(sellingCosts),
      totalProjectCost: round(total),
    };
  }

  profit(arv, totalProjectCost) {
    const netProfit = arv - totalProjectCost;
    const marginOnCost = totalProjectCost > 0 ? (netProfit / totalProjectCost) * 100 : 0;
    const marginOnResale = arv > 0 ? (netProfit / arv) * 100 : 0;
    return {
      arv: round(arv),
      totalProjectCost: round(totalProjectCost),
      netProfit: round(netProfit),
      marginOnCost: round1(marginOnCost),
      marginOnResale: round1(marginOnResale),
      meetsMinimum:
        netProfit >= this.c.minProfitDollars &&
        marginOnCost / 100 >= this.c.minMarginPct,
    };
  }

  // Estimated cash in the deal (down payment + costs not covered by the loan).
  cashInvested({ purchasePrice, costBreakdown }) {
    const downPayment = purchasePrice * (1 - this.c.loanToValue);
    const outOfPocket =
      downPayment +
      costBreakdown.buyerClosing +
      costBreakdown.financingCost +
      costBreakdown.renovation +
      costBreakdown.contingency +
      costBreakdown.permitFees +
      costBreakdown.holding.total;
    return round(outOfPocket);
  }

  // Maximum Allowable Offer using conservative ARV.
  maximumAllowableOffer({ conservativeArv, expectedReno, holdingMonths }) {
    const c = this.c;
    const contingency = expectedReno * c.baseContingency;
    const holding =
      (c.monthlyInsurance + c.monthlyUtilities + c.monthlyMaintenance) *
        holdingMonths +
      ((conservativeArv * c.propertyTaxAnnualPct) / 12) * holdingMonths;
    const financing = conservativeArv * c.financingPct;
    const selling = conservativeArv * c.sellingCostPct;
    const requiredProfit = Math.max(
      c.minProfitDollars,
      conservativeArv * c.minMarginPct * 0.5 // soft floor tied to ARV
    );
    const riskBuffer = conservativeArv * c.riskBufferPct;

    const mao =
      conservativeArv -
      expectedReno -
      contingency -
      c.permitFees -
      holding -
      financing -
      selling -
      requiredProfit -
      riskBuffer;

    return Math.max(0, round(mao));
  }

  // Three scenarios. Recommendation is driven by conservative + base only.
  scenarios({ purchasePrice, arv, reno, holdingMonths }) {
    const conservative = this.profit(
      arv.low,
      this.totalCost({
        purchasePrice,
        renovation: reno.high,
        holdingMonths: holdingMonths + 2,
        arv: arv.low,
        contingencyPct: CONTINGENCY_BY_SCOPE.heavy,
      }).totalProjectCost
    );
    const base = this.profit(
      arv.expected,
      this.totalCost({
        purchasePrice,
        renovation: reno.expected,
        holdingMonths,
        arv: arv.expected,
      }).totalProjectCost
    );
    const optimistic = this.profit(
      arv.high,
      this.totalCost({
        purchasePrice,
        renovation: reno.low,
        holdingMonths: Math.max(1, holdingMonths - 1),
        arv: arv.high,
        contingencyPct: CONTINGENCY_BY_SCOPE.cosmetic,
      }).totalProjectCost
    );
    return { conservative, base, optimistic };
  }

  // 100-point score → 1–10 scale. Deterministic weighting per the blueprint.
  scoreDeal(m) {
    const parts = {};

    // Financial spread: 30 pts. Scaled so 30%+ margin on cost = full marks.
    parts.financialSpread = clamp((m.marginOnCost / 30) * 30, 0, 30);

    // ARV confidence: 15 pts, driven by comp count.
    parts.arvConfidence = m.compCount >= 5 ? 15 : m.compCount >= 3 ? 11 : m.compCount >= 1 ? 6 : 2;

    // Renovation risk: 15 pts (lower scope = higher score).
    parts.renovationRisk =
      m.scope === "cosmetic" ? 15 : m.scope === "moderate" ? 10 : 5;

    // Location & resale demand: 15 pts.
    parts.locationDemand =
      m.demand === "high" ? 15 : m.demand === "medium" ? 10 : 6;

    // Value-add potential: 15 pts.
    let va = 0;
    if (m.aduPotential === "strong") va += 8;
    else if (m.aduPotential === "moderate") va += 5;
    else if (m.aduPotential === "weak") va += 2;
    if (m.expansionPotential) va += 4;
    if (m.extraBedBathPotential) va += 3;
    parts.valueAdd = clamp(va, 0, 15);

    // Legal / permit / occupancy: 10 pts.
    parts.legalOccupancy =
      m.riskLevel === "low" ? 10 : m.riskLevel === "medium" ? 6 : 2;

    const raw =
      parts.financialSpread +
      parts.arvConfidence +
      parts.renovationRisk +
      parts.locationDemand +
      parts.valueAdd +
      parts.legalOccupancy;

    return {
      parts: Object.fromEntries(
        Object.entries(parts).map(([k, v]) => [k, round1(v)])
      ),
      rawScore: round1(raw),
      score: round1(raw / 10),
    };
  }
}

function round(n) {
  return Math.round(n || 0);
}
function round1(n) {
  return Math.round((n || 0) * 10) / 10;
}
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n || 0));
}

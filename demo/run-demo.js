// Flip Scout — manual-input demo.
// Runs the FULL conservative analysis on demo/property.json (no network) and:
//   1. prints the complete required output to the console
//   2. writes demo/report.html — one presentable screen for Juan
//
// Usage:  npm run demo        (or: node demo/run-demo.js [path-to-record.json])
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { analyzeManualRecord } from "../src/manual.js";
import { DATA_DISCLAIMER } from "../src/config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const recordPath = process.argv[2] ? resolve(process.argv[2]) : join(__dirname, "property.json");
const record = JSON.parse(readFileSync(recordPath, "utf8"));

const { deal, validComps, invalidComps } = analyzeManualRecord(record);
const money = (n) => "$" + Math.round(n || 0).toLocaleString();
const pct = (n) => (n ?? 0) + "%";
const list = (a) => (a && a.length ? a.join(", ") : "none detected");

// ---------------------------------------------------------------- console ---
const L = [];
L.push("========================================================");
L.push("  TWIN HOME BUYER — FLIP SCOUT — MANUAL DEMO ANALYSIS");
L.push("========================================================");
L.push("");
L.push("PROPERTY");
L.push(`  Property address: ${deal.address}`);
L.push(`  Asking price:     ${money(deal.price)}`);
L.push(`  Property type:    ${record.listing.propertyType}`);
L.push(`  Beds / baths:     ${deal.beds} / ${deal.baths}`);
L.push(`  Living area:      ${deal.squareFeet} sqft`);
L.push(`  Lot size:         ${record.listing.lotSize} sqft`);
L.push(`  Year built:       ${record.listing.yearBuilt}`);
L.push(`  Days on market:   ${record.listing.daysOnMarket}`);
L.push(`  Listing URL:      ${deal.url}`);
L.push("");
L.push("JUAN CONDITION STRATEGY");
L.push(`  Juan Strategy Fit:      ${deal.strategyFit}`);
L.push(`  Condition category:     ${deal.conditionCategory}`);
L.push(`  Condition-fit score:    ${deal.conditionFitScore}/15`);
L.push(`  Ugly-but-fixable signals: ${list(deal.uglyFixableSignals)}`);
L.push(`  Turnkey signals:        ${list(deal.turnkeySignals)}`);
L.push(`  Heavy-risk signals:     ${list(deal.extremeRiskSignals)}`);
L.push(`  Condition confidence:   ${deal.conditionConfidence}`);
L.push(`  Observation source:     ${deal.observationSource}`);
L.push(`  Why it fits/doesn't:    ${deal.strategyFitReason}`);
L.push("");
L.push(`COMPARABLE SALES (${validComps.length} valid, ${invalidComps.length} rejected)`);
validComps.forEach((c, i) => {
  L.push(`  ${i + 1}. ${c.address}`);
  L.push(`     Sold ${money(c.soldPrice)} on ${c.soldDate} | ${c.sqft} sqft | ${money(c.pricePerSqft)}/sqft`);
  L.push(`     Source: ${c.url}`);
});
if (invalidComps.length) {
  invalidComps.forEach((x) => L.push(`  [rejected] ${x.problems.join("; ")}`));
}
L.push("");
const cb = deal.costBreakdown;
L.push("FINANCIAL ANALYSIS (conservative-led)");
L.push(`  Conservative ARV:        ${money(deal.arv.low)}`);
L.push(`  Base ARV:                ${money(deal.arv.expected)}`);
L.push(`  Optimistic ARV:          ${money(deal.arv.high)}`);
L.push(`  Renovation low:          ${money(deal.reno.low)}`);
L.push(`  Renovation expected:     ${money(deal.reno.expected)} (${deal.reno.scope}, ${money(deal.reno.perSqft)}/sqft)`);
L.push(`  Renovation high:         ${money(deal.reno.high)}`);
L.push(`  Contingency (base):      ${money(cb.contingency)}`);
L.push(`  Buyer closing costs:     ${money(cb.buyerClosing)}`);
L.push(`  Financing costs:         ${money(cb.financingCost)}`);
L.push(`  Interest:                ${money(cb.holding.interest)}`);
L.push(`  Property taxes:          ${money(cb.holding.taxes)}`);
L.push(`  Insurance:               ${money(cb.holding.insurance)}`);
L.push(`  Utilities:               ${money(cb.holding.utilities)}`);
L.push(`  Permit & professional:   ${money(cb.permitFees)}`);
L.push(`  Selling costs:           ${money(cb.sellingCosts)}`);
L.push(`  Total project cost:      ${money(cb.totalProjectCost)}`);
L.push(`  Net profit (base):       ${money(deal.base.netProfit)}`);
L.push(`  Margin on cost (base):   ${pct(deal.base.marginOnCost)}`);
L.push(`  Margin on resale (base): ${pct(deal.base.marginOnResale)}`);
L.push(`  Maximum allowable offer: ${money(deal.mao)}`);
L.push(`  Estimated cash required: ${money(deal.cashRequired)}`);
L.push(`  Return on cash (base):   ${pct(deal.returnOnCash)}`);
L.push("");
L.push("SCENARIO RESULTS");
for (const key of ["conservative", "base", "optimistic"]) {
  const s = deal.scenarios[key];
  L.push(`  ${key.padEnd(13)} profit ${money(s.netProfit).padStart(12)} | margin/cost ${pct(s.marginOnCost)} | meets min: ${s.meetsMinimum}`);
}
L.push("");
L.push("DECISION");
L.push(`  Deal score:              ${deal.score}/10`);
L.push(`  Confidence:              ${deal.confidence}`);
L.push(`  Estimated timeline:      ${deal.estimatedTimeline}`);
L.push(`  Qualified:               ${deal.qualified ? "YES" : "NO"}`);
L.push(`  Decision:                ${deal.qualified ? "PRESENT TO JUAN" : "REJECT / HOLD"}`);
if (!deal.qualified) L.push(`  Rejection reason:        ${deal.reason}`);
L.push(`  Recommended next step:   ${deal.recommendation}`);
L.push(`  Human approval status:   PENDING — human approval required before any external action`);
L.push("");
L.push(`  Data note: ${DATA_DISCLAIMER}`);
L.push("========================================================");

console.log(L.join("\n"));

// ------------------------------------------------------------------- html ---
const fitColor = { Strong: "#059669", Moderate: "#d97706", Weak: "#64748b", Reject: "#e11d48" }[deal.strategyFit] || "#334155";
const compRows = validComps
  .map(
    (c) => `<tr><td>${c.address}</td><td>${money(c.soldPrice)}</td><td>${c.soldDate}</td><td>${c.sqft}</td><td>${money(c.pricePerSqft)}</td><td><a href="${c.url}">source</a></td></tr>`
  )
  .join("");

const html = `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Flip Scout — ${deal.address}</title>
<style>
  body{font:15px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:#f8fafc;color:#0f172a}
  .wrap{max-width:920px;margin:0 auto;padding:24px}
  .head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
  h1{font-size:22px;margin:0 0 4px}
  .sub{color:#64748b;font-size:13px}
  .fit{background:${fitColor};color:#fff;padding:8px 14px;border-radius:10px;font-weight:700}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:18px;margin-top:16px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px}
  .k{color:#64748b;font-size:12px}.v{font-weight:600}
  .big{font-size:20px;font-weight:800}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eef2f7}
  .decision{font-size:18px;font-weight:800;color:${deal.qualified ? "#059669" : "#e11d48"}}
  .pill{display:inline-block;background:#f1f5f9;border-radius:999px;padding:2px 10px;margin:2px;font-size:12px}
  .note{color:#94a3b8;font-size:12px;margin-top:14px}
</style></head><body><div class="wrap">
  <div class="head">
    <div><h1>${deal.address}</h1>
      <div class="sub">${record.listing.propertyType} · ${deal.beds} bd / ${deal.baths} ba · ${deal.squareFeet} sqft · built ${record.listing.yearBuilt} · ${record.listing.daysOnMarket} DOM · <a href="${deal.url}">listing</a></div>
    </div>
    <div class="fit">Juan Fit: ${deal.strategyFit}</div>
  </div>

  <div class="card"><div class="grid">
    <div><div class="k">Condition</div><div class="v">${deal.conditionCategory}</div></div>
    <div><div class="k">Condition-fit</div><div class="v">${deal.conditionFitScore}/15</div></div>
    <div><div class="k">Deal score</div><div class="big">${deal.score}/10</div></div>
    <div><div class="k">Confidence</div><div class="v">${deal.confidence}</div></div>
    <div><div class="k">Timeline</div><div class="v">${deal.estimatedTimeline}</div></div>
  </div>
  <div style="margin-top:12px"><span class="k">Ugly-but-fixable:</span> ${deal.uglyFixableSignals.map((s)=>`<span class="pill">${s}</span>`).join(" ") || "—"}</div>
  <div><span class="k">Turnkey:</span> ${deal.turnkeySignals.map((s)=>`<span class="pill">${s}</span>`).join(" ") || "none"} &nbsp; <span class="k">Heavy-risk:</span> ${deal.extremeRiskSignals.map((s)=>`<span class="pill">${s}</span>`).join(" ") || "none"}</div>
  </div>

  <div class="card"><div class="grid">
    <div><div class="k">Asking</div><div class="big">${money(deal.price)}</div></div>
    <div><div class="k">Conservative ARV</div><div class="big">${money(deal.arv.low)}</div></div>
    <div><div class="k">Expected renovation</div><div class="v">${money(deal.reno.expected)}</div></div>
    <div><div class="k">Total project cost</div><div class="v">${money(cb.totalProjectCost)}</div></div>
    <div><div class="k">Conservative profit</div><div class="big" style="color:#059669">${money(deal.scenarios.conservative.netProfit)}</div></div>
    <div><div class="k">Conservative margin</div><div class="v">${pct(deal.scenarios.conservative.marginOnCost)}</div></div>
    <div><div class="k">Max allowable offer</div><div class="v">${money(deal.mao)}</div></div>
    <div><div class="k">Cash required</div><div class="v">${money(deal.cashRequired)}</div></div>
  </div></div>

  <div class="card">
    <div class="k" style="margin-bottom:6px">Scenarios (net profit · margin on cost)</div>
    <div class="grid">
      <div><div class="k">Conservative</div><div class="v">${money(deal.scenarios.conservative.netProfit)} · ${pct(deal.scenarios.conservative.marginOnCost)}</div></div>
      <div><div class="k">Base</div><div class="v">${money(deal.scenarios.base.netProfit)} · ${pct(deal.scenarios.base.marginOnCost)}</div></div>
      <div><div class="k">Optimistic</div><div class="v">${money(deal.scenarios.optimistic.netProfit)} · ${pct(deal.scenarios.optimistic.marginOnCost)}</div></div>
    </div>
  </div>

  <div class="card">
    <div class="k" style="margin-bottom:6px">Comparable sales (${validComps.length} valid)</div>
    <table><thead><tr><th>Address</th><th>Sold</th><th>Date</th><th>Sqft</th><th>$/sqft</th><th>Src</th></tr></thead>
    <tbody>${compRows}</tbody></table>
  </div>

  <div class="card">
    <div class="decision">Decision: ${deal.qualified ? "PRESENT TO JUAN" : "REJECT / HOLD"}</div>
    ${deal.qualified ? "" : `<div class="k">Reason: ${deal.reason}</div>`}
    <div style="margin-top:8px"><span class="k">Main opportunity:</span> ${deal.uglyFixableSignals[0] || "outdated / value-add"}</div>
    <div><span class="k">Main risk:</span> ${(deal.classification.redFlags||[])[0] || "See risk notes — verify on inspection"}</div>
    <div style="margin-top:8px"><b>Next step:</b> ${deal.recommendation}</div>
    <div><b>Human approval:</b> PENDING (required before any external action)</div>
  </div>

  <div class="note">${record._dataLabels?.note || ""}<br/>${DATA_DISCLAIMER}</div>
</div></body></html>`;

const outPath = join(__dirname, "report.html");
writeFileSync(outPath, html);
console.log(`\nHTML report written to: ${outPath}`);

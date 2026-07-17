// Flip Scout — batch "daily leads" run (manual mode, no network).
// Runs every property in demo/properties.json through the engine, RANKS the
// qualifiers, names the lead, and lists the rejects with reasons. This is what
// the autonomous daily scan produces once deployed — here it runs offline.
//
// Usage:  npm run leads      (or: node demo/run-leads.js [path-to-batch.json])
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { analyzeManualRecord } from "../src/manual.js";
import { DATA_DISCLAIMER } from "../src/config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = process.argv[2] ? resolve(process.argv[2]) : join(__dirname, "properties.json");
const batch = JSON.parse(readFileSync(path, "utf8"));

const money = (n) => "$" + Math.round(n || 0).toLocaleString();
const pct = (n) => (n ?? 0) + "%";

const analyzed = batch.properties.map((rec) => analyzeManualRecord(rec).deal);
const qualified = analyzed
  .filter((d) => d.qualified)
  .sort((a, b) => b.score - a.score || b.conservative.netProfit - a.conservative.netProfit);
const rejected = analyzed.filter((d) => !d.qualified);
const lead = qualified[0] || null;

// ---------------------------------------------------------------- console ---
const L = [];
L.push("==================================================================");
L.push("  TWIN HOME BUYER — FLIP SCOUT — DAILY LEADS (manual demo batch)");
L.push("==================================================================");
L.push(`  Reviewed: ${analyzed.length}   Qualified: ${qualified.length}   Rejected: ${rejected.length}`);
L.push("");
if (lead) {
  L.push(`>>> LEAD (Juan's top choice): ${lead.address}`);
  L.push(`    Fit ${lead.strategyFit} | Score ${lead.score}/10 | Conservative profit ${money(lead.conservative.netProfit)} (${pct(lead.conservative.marginOnCost)})`);
  L.push(`    Asking ${money(lead.price)} | Conservative ARV ${money(lead.arv.low)} | Reno ${money(lead.reno.expected)} | MAO ${money(lead.mao)}`);
  L.push(`    Next step: ${lead.recommendation}`);
} else {
  L.push(">>> No property qualified today.");
}
L.push("");
L.push("QUALIFIED LEADS (ranked):");
qualified.forEach((d, i) => {
  L.push(`  ${i + 1}. ${d.address}  — ${d.strategyFit}, score ${d.score}/10, cons. profit ${money(d.conservative.netProfit)} (${pct(d.conservative.marginOnCost)})`);
});
if (!qualified.length) L.push("  (none)");
L.push("");
L.push("REJECTED (with reason):");
rejected.forEach((d) => {
  L.push(`  - ${d.address}  [${d.conditionCategory}] → ${d.reason}`);
});
L.push("");
L.push(`  Human approval required before any external action.`);
L.push(`  Data note: ${DATA_DISCLAIMER}`);
L.push("==================================================================");
console.log(L.join("\n"));

// ------------------------------------------------------------------- html ---
const FIT = { Strong: "#059669", Moderate: "#d97706", Weak: "#64748b", Reject: "#e11d48" };
function leadCard(d, rank) {
  const border = rank === 0 ? "border:2px solid #059669" : "border:1px solid #e2e8f0";
  const badge = rank === 0 ? `<span style="background:#059669;color:#fff;padding:2px 10px;border-radius:999px;font-size:12px;margin-left:8px">LEAD</span>` : "";
  return `<div class="card" style="${border}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div><div style="font-weight:800;font-size:17px">${rank + 1}. ${d.address}${badge}</div>
        <div class="sub">${d.beds} bd / ${d.baths} ba · ${d.squareFeet} sqft · <a href="${d.url}">listing</a></div></div>
      <div style="text-align:right"><div style="font-size:20px;font-weight:800">${d.score}/10</div>
        <div style="color:${FIT[d.strategyFit] || "#334155"};font-weight:700;font-size:13px">${d.strategyFit}</div></div>
    </div>
    <div class="grid">
      <div><div class="k">Asking</div><div class="v">${money(d.price)}</div></div>
      <div><div class="k">Conservative ARV</div><div class="v">${money(d.arv.low)}</div></div>
      <div><div class="k">Expected reno</div><div class="v">${money(d.reno.expected)}</div></div>
      <div><div class="k">Conservative profit</div><div class="v" style="color:#059669">${money(d.conservative.netProfit)}</div></div>
      <div><div class="k">Conservative margin</div><div class="v">${pct(d.conservative.marginOnCost)}</div></div>
      <div><div class="k">Max allowable offer</div><div class="v">${money(d.mao)}</div></div>
    </div>
    <div style="margin-top:8px"><span class="k">Condition:</span> ${d.conditionCategory} · <span class="k">Opportunity:</span> ${(d.uglyFixableSignals || [])[0] || "value-add"} · <b>Next: ${d.recommendation}</b></div>
  </div>`;
}
const rejRows = rejected
  .map((d) => `<tr><td>${d.address}</td><td>${d.conditionCategory}</td><td>${d.reason}</td></tr>`)
  .join("");

const html = `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Flip Scout — Daily Leads</title>
<style>
  body{font:15px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:#f8fafc;color:#0f172a}
  .wrap{max-width:960px;margin:0 auto;padding:24px}
  h1{font-size:22px;margin:0}
  .sub{color:#64748b;font-size:13px}
  .stats{display:flex;gap:22px;margin:12px 0 6px}
  .stat .n{font-size:24px;font-weight:800}.stat .l{color:#64748b;font-size:12px}
  .card{background:#fff;border-radius:14px;padding:16px;margin-top:14px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:10px}
  .k{color:#64748b;font-size:12px}.v{font-weight:700}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
  th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eef2f7}
  .note{color:#94a3b8;font-size:12px;margin-top:16px}
  h2{font-size:15px;margin:22px 0 0}
</style></head><body><div class="wrap">
  <h1>Flip Scout — Daily Leads</h1>
  <div class="sub">Twin Home Buyer · manual demo batch · conservative-led ranking</div>
  <div class="stats">
    <div class="stat"><div class="n">${analyzed.length}</div><div class="l">Reviewed</div></div>
    <div class="stat"><div class="n">${qualified.length}</div><div class="l">Qualified</div></div>
    <div class="stat"><div class="n">${rejected.length}</div><div class="l">Rejected</div></div>
    <div class="stat"><div class="n">${lead ? lead.score + "/10" : "—"}</div><div class="l">Lead score</div></div>
  </div>
  <h2>Qualified leads (ranked — #1 is Juan's top choice)</h2>
  ${qualified.length ? qualified.map(leadCard).join("") : '<div class="card">No property qualified today.</div>'}
  <h2>Rejected</h2>
  <div class="card"><table><thead><tr><th>Address</th><th>Condition</th><th>Reason</th></tr></thead><tbody>${rejRows}</tbody></table></div>
  <div class="note">Human approval required before any external action.<br/>${DATA_DISCLAIMER}<br/>${batch._dataLabels || ""}</div>
</div></body></html>`;

const out = join(__dirname, "leads.html");
writeFileSync(out, html);
console.log(`\nLeads report written to: ${out}`);

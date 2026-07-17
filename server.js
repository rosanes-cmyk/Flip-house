// Flip Scout — one-button local app for Juan.
// Start it with `npm start`, open the URL, click RUN. It runs the engine and
// shows ONLY qualified leads (rejected/turnkey/overpriced are hidden).
//
// No API key needed — this runs the analysis engine over your property file
// (demo/properties.json). Point PROPERTIES_FILE at your own file to use real ones.
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { analyzeManualRecord } from "./src/manual.js";
import { DATA_DISCLAIMER } from "./src/config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;
const PROPERTIES_FILE = process.env.PROPERTIES_FILE || join(__dirname, "demo", "properties.json");

function runScan() {
  const batch = JSON.parse(readFileSync(PROPERTIES_FILE, "utf8"));
  const analyzed = batch.properties.map((r) => analyzeManualRecord(r).deal);
  const qualified = analyzed
    .filter((d) => d.qualified)
    .sort((a, b) => b.score - a.score || b.conservative.netProfit - a.conservative.netProfit);
  return {
    reviewed: analyzed.length,
    qualifiedCount: qualified.length,
    rejectedCount: analyzed.length - qualified.length,
    disclaimer: DATA_DISCLAIMER,
    leads: qualified.map((d) => ({
      address: d.address,
      url: d.url,
      fit: d.strategyFit,
      score: d.score,
      condition: d.conditionCategory,
      price: d.price,
      arv: d.arv.low,
      reno: d.reno.expected,
      profit: d.conservative.netProfit,
      margin: d.conservative.marginOnCost,
      mao: d.mao,
      timeline: d.estimatedTimeline,
      opportunity: (d.uglyFixableSignals || [])[0] || "value-add",
      risk: (d.classification?.redFlags || [])[0] || "Verify on inspection",
      next: d.recommendation,
    })),
  };
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Flip Scout</title>
<style>
  body{font:16px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:#0f172a;color:#e2e8f0}
  .wrap{max-width:900px;margin:0 auto;padding:28px}
  h1{font-size:26px;margin:0}
  .sub{color:#94a3b8;font-size:14px;margin-top:2px}
  .runbtn{display:block;width:100%;margin:22px 0;padding:22px;font-size:22px;font-weight:800;
    background:#059669;color:#fff;border:none;border-radius:16px;cursor:pointer}
  .runbtn:disabled{background:#334155;cursor:wait}
  .stats{display:flex;gap:26px;justify-content:center;margin:12px 0}
  .stat .n{font-size:26px;font-weight:800;text-align:center}.stat .l{color:#94a3b8;font-size:12px;text-align:center}
  .lead{background:#111827;border:2px solid #059669;border-radius:16px;padding:20px;margin-top:16px}
  .other{border:1px solid #334155}
  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
  .addr{font-size:19px;font-weight:800}
  .badge{background:#059669;color:#fff;padding:3px 12px;border-radius:999px;font-size:12px;margin-left:8px}
  .score{font-size:26px;font-weight:800}
  a{color:#38bdf8}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;margin-top:14px}
  .k{color:#94a3b8;font-size:12px}.v{font-weight:700;font-size:17px}
  .profit{color:#34d399}
  .foot{color:#64748b;font-size:12px;margin-top:20px}
  .none{background:#111827;border:1px solid #334155;border-radius:14px;padding:24px;text-align:center;color:#94a3b8;margin-top:16px}
</style></head><body><div class="wrap">
  <h1>🏠 Flip Scout</h1>
  <div class="sub">Twin Home Buyer — press the button, see today's lead.</div>
  <button class="runbtn" id="run">▶  RUN FLIP SCOUT</button>
  <div id="stats"></div>
  <div id="out"></div>
  <div class="foot" id="foot"></div>
</div>
<script>
  const $=(id)=>document.getElementById(id);
  const money=(n)=>"$"+Math.round(n||0).toLocaleString();
  function leadCard(d,i){
    return \`<div class="lead \${i>0?'other':''}">
      <div class="top">
        <div><span class="addr">\${d.address}</span>\${i===0?'<span class="badge">TOP LEAD</span>':''}
          <div class="sub">\${d.condition} · <a href="\${d.url}" target="_blank">listing</a></div></div>
        <div style="text-align:right"><div class="score">\${d.score}/10</div><div class="sub">\${d.fit}</div></div>
      </div>
      <div class="grid">
        <div><div class="k">Asking</div><div class="v">\${money(d.price)}</div></div>
        <div><div class="k">Conservative ARV</div><div class="v">\${money(d.arv)}</div></div>
        <div><div class="k">Expected reno</div><div class="v">\${money(d.reno)}</div></div>
        <div><div class="k">Conservative profit</div><div class="v profit">\${money(d.profit)}</div></div>
        <div><div class="k">Margin</div><div class="v">\${d.margin}%</div></div>
        <div><div class="k">Max offer</div><div class="v">\${money(d.mao)}</div></div>
      </div>
      <div style="margin-top:12px"><span class="k">Opportunity:</span> \${d.opportunity} &nbsp;·&nbsp; <span class="k">Risk:</span> \${d.risk}</div>
      <div style="margin-top:6px"><b>→ \${d.next}</b> &nbsp;·&nbsp; timeline \${d.timeline}</div>
    </div>\`;
  }
  $("run").onclick=async()=>{
    $("run").disabled=true;$("run").textContent="Running…";$("out").innerHTML="";
    try{
      const r=await fetch("/api/run");const data=await r.json();
      $("stats").innerHTML=
        '<div class="stats">'+
        '<div class="stat"><div class="n">'+data.reviewed+'</div><div class="l">Reviewed</div></div>'+
        '<div class="stat"><div class="n">'+data.qualifiedCount+'</div><div class="l">Qualified</div></div>'+
        '<div class="stat"><div class="n">'+data.rejectedCount+'</div><div class="l">Rejected (hidden)</div></div>'+
        '</div>';
      $("out").innerHTML = data.leads.length
        ? data.leads.map(leadCard).join("")
        : '<div class="none">No qualified lead today. Nothing worth Juan\\'s time.</div>';
      $("foot").textContent = data.disclaimer + "  ·  Human approval required before any action.";
    }catch(e){ $("out").innerHTML='<div class="none">Error: '+e.message+'</div>'; }
    $("run").disabled=false;$("run").textContent="▶  RUN FLIP SCOUT";
  };
</script></body></html>`;

http
  .createServer((req, res) => {
    if (req.url.startsWith("/api/run")) {
      try {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(runScan()));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(PAGE);
  })
  .listen(PORT, () => {
    console.log(`\n  Flip Scout is running.`);
    console.log(`  Open this in your browser:  http://localhost:${PORT}`);
    console.log(`  Then click the green RUN button.\n  (Press Ctrl+C to stop.)\n`);
  });

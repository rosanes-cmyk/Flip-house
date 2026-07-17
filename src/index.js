// Flip Scout AI Agent — Cloudflare Worker entry point.
//
// Endpoints:
//   GET  /            health / usage
//   POST /run         run the full daily scan (protected by AGENT_SECRET)
//   POST /analyze     analyze a single listing URL: { "url": "..." } (protected)
//
// Scheduled trigger (see wrangler.toml) runs /run once per day.
import { ResearchAgent, extractListingUrls } from "./agents/researcher.js";
import { checkBuyBox, analyzeDeal } from "./agents/analyzer.js";
import { Database } from "./tools/database.js";
import { GeminiAI } from "./tools/gemini.js";
import { deliverReport } from "./tools/email.js";
import { TARGET_AREAS, DATA_DISCLAIMER, MIN_SCORE_TO_PRESENT } from "./config.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/" ) {
      return json({
        agent: "Twin Home Buyer Flip Scout",
        endpoints: {
          "POST /run": "run daily scan (needs Authorization: Bearer AGENT_SECRET)",
          "POST /analyze": "analyze one listing { url } (needs auth)",
        },
      });
    }

    if (!authorized(request, env)) {
      return json({ error: "unauthorized" }, 401);
    }

    if (url.pathname === "/run" && request.method === "POST") {
      const results = await runDailyScan(env);
      return json(results);
    }

    if (url.pathname === "/analyze" && request.method === "POST") {
      const { url: listingUrl } = await request.json().catch(() => ({}));
      if (!listingUrl) return json({ error: "missing url" }, 400);
      const deal = await analyzeSingle(listingUrl, env);
      return json(deal);
    }

    return json({ error: "not found" }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyScan(env));
  },
};

function authorized(request, env) {
  if (!env.AGENT_SECRET) return true; // no secret set → open (dev only)
  const auth = request.headers.get("Authorization") || "";
  return auth === `Bearer ${env.AGENT_SECRET}`;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function analyzeSingle(listingUrl, env) {
  const researcher = new ResearchAgent(env.GEMINI_API_KEY);
  const holdingMonths = Number(env.HOLDING_MONTHS) || 6;

  const listing = await researcher.extractListing(listingUrl);
  if (!listing || !listing.price) {
    return { error: "Could not extract listing details", url: listingUrl };
  }
  const gate = checkBuyBox(listing);
  if (!gate.passed) {
    return { qualified: false, address: listing.address, reason: gate.reason };
  }
  const [classification, comps, risks] = await Promise.all([
    researcher.classifyProperty(listing),
    researcher.findComps(listing),
    researcher.checkRisks(listing),
  ]);
  return analyzeDeal(listing, { classification, comps, risks }, holdingMonths);
}

async function runDailyScan(env) {
  const gemini = new GeminiAI(env.GEMINI_API_KEY);
  const researcher = new ResearchAgent(env.GEMINI_API_KEY);
  const db = new Database(env.SUPABASE_URL, env.SUPABASE_KEY);
  const holdingMonths = Number(env.HOLDING_MONTHS) || 6;
  const maxListings = Number(env.MAX_LISTINGS_PER_RUN) || 20;

  const areasSearched = Object.values(TARGET_AREAS).flatMap((a) => a.neighborhoods);
  const results = {
    date: new Date().toISOString(),
    areasSearched,
    sourcesChecked: [
      "Redfin (public listing pages)",
      "Zillow (public listing pages)",
      "Realtor.com (public listing pages)",
      "County assessor / GIS parcel (via search)",
      "City permit & planning/zoning portals (via search)",
      "FEMA flood maps (via search)",
      "Public fire-hazard maps (via search)",
      "Public sold-property data (via search)",
    ],
    listingsFound: 0,
    buyBoxPassed: 0,
    qualified: 0,
    // Condition-strategy counters (Juan's dashboard).
    middleTargets: 0,
    turnkeyRejected: 0,
    extremeRejected: 0,
    needPhotoReview: 0,
    needInspection: 0,
    conditionCounts: {
      middle: 0,
      light_cosmetic: 0,
      heavy: 0,
      turnkey: 0,
      extreme: 0,
      unknown: 0,
    },
    dataLimitations: DATA_DISCLAIMER,
    topDeals: [],
    rejected: [],
  };

  console.log("Searching target areas...");
  const searches = await researcher.searchForListings();
  const urls = [
    ...new Set(searches.flatMap((s) => extractListingUrls(s.text))),
  ].slice(0, maxListings);
  console.log(`Found ${urls.length} candidate listing URLs`);

  for (const listingUrl of urls) {
    try {
      const listing = await researcher.extractListing(listingUrl);
      if (!listing || !listing.price) continue;
      results.listingsFound++;

      const gate = checkBuyBox(listing);
      if (!gate.passed) {
        results.rejected.push({ address: listing.address, reason: gate.reason });
        await db.saveListing(listing, gate);
        continue;
      }
      results.buyBoxPassed++;
      await db.saveListing(listing, gate);

      const [classification, comps, risks] = await Promise.all([
        researcher.classifyProperty(listing),
        researcher.findComps(listing),
        researcher.checkRisks(listing),
      ]);

      const deal = analyzeDeal(listing, { classification, comps, risks }, holdingMonths);
      if (deal.arv) await db.saveDealAnalysis(deal);

      // Condition tallies (counted for every analyzed listing, not just winners).
      if (deal.conditionCategoryKey && results.conditionCounts[deal.conditionCategoryKey] != null) {
        results.conditionCounts[deal.conditionCategoryKey]++;
      }
      if (deal.conditionCategoryKey === "middle") results.middleTargets++;
      if (deal.conditionGate === "reject_turnkey") results.turnkeyRejected++;
      if (deal.conditionGate === "reject_extreme" || deal.conditionGate === "blocked_risk")
        results.extremeRejected++;
      if (deal.needsPhotoReview) results.needPhotoReview++;
      if (deal.needsInspection) results.needInspection++;

      if (deal.qualified) {
        results.qualified++;
        results.topDeals.push({
          address: deal.address,
          url: deal.url,
          price: deal.price,
          arv: deal.arv.expected,
          reno: deal.reno.expected,
          profit: deal.base.netProfit,
          marginOnCost: deal.base.marginOnCost,
          mao: deal.mao,
          score: deal.score,
          confidence: deal.confidence,
          conditionCategory: deal.conditionCategory,
          conditionCategoryKey: deal.conditionCategoryKey,
          conditionFitScore: deal.conditionFitScore,
          strategyFit: deal.strategyFit,
          estimatedTimeline: deal.estimatedTimeline,
          uglyFixableSignal: (deal.uglyFixableSignals || [])[0] || null,
          recommendation: deal.recommendation,
          topRisk: (deal.classification.redFlags || [])[0] || "See risk scan",
        });
      } else {
        results.rejected.push({
          address: deal.address,
          conditionCategory: deal.conditionCategory,
          conditionGate: deal.conditionGate,
          reason: deal.reason || `Score ${deal.score} / conservative not profitable`,
        });
      }
    } catch (e) {
      console.error(`analyze failed for ${listingUrl}: ${e.message}`);
    }
    await sleep(2500);
  }

  results.topDeals.sort((a, b) => b.score - a.score);

  const emailBody = await buildEmail(results, gemini);
  const delivery = await deliverReport({
    subject: `Flip Scout Daily Report - ${new Date().toLocaleDateString()} - ${results.qualified} deal(s)`,
    body: emailBody,
    env,
  });
  results.emailDelivered = delivery.sent;
  results.emailBody = emailBody;

  await db.saveDailyReport(results);
  console.log(`Scan complete: ${results.qualified} qualified of ${results.listingsFound} reviewed`);
  return results;
}

async function buildEmail(results, gemini) {
  const deals = results.topDeals.slice(0, 5);

  // Deterministic body — never depends on the model to state the numbers.
  const lines = [];
  lines.push(`Subject: Daily Flip Scout Report - ${new Date().toLocaleDateString()}`);
  lines.push("");
  lines.push("Hi Juan,");
  lines.push("");
  lines.push(
    `Today the system reviewed ${results.listingsFound} listings across San Francisco, San Mateo, and Sunnyvale.`
  );
  lines.push(`${results.buyBoxPassed} met the initial buy box.`);
  lines.push(`${results.qualified} scored ${MIN_SCORE_TO_PRESENT} or higher.`);
  lines.push("");

  if (deals.length === 0) {
    lines.push("No properties cleared the bar today under conservative assumptions.");
  } else {
    lines.push("Top opportunities:");
    deals.forEach((d, i) => {
      lines.push("");
      lines.push(`${i + 1}. ${d.address}`);
      lines.push(`   Juan Strategy Fit: ${d.strategyFit}`);
      lines.push(`   Condition: ${d.conditionCategory} (fit ${d.conditionFitScore}/15)`);
      lines.push(`   Asking Price: $${fmt(d.price)}`);
      lines.push(`   Estimated ARV: $${fmt(d.arv)}`);
      lines.push(`   Estimated Renovation: $${fmt(d.reno)}`);
      lines.push(`   Estimated Profit: $${fmt(d.profit)}`);
      lines.push(`   Estimated Margin (on cost): ${d.marginOnCost}%`);
      lines.push(`   Max Allowable Offer: $${fmt(d.mao)}`);
      lines.push(`   Estimated Timeline: ${d.estimatedTimeline}`);
      lines.push(`   Score: ${d.score}/10 (${d.confidence})`);
      lines.push(`   Main Opportunity: ${d.uglyFixableSignal || "outdated / value-add"}`);
      lines.push(`   Main Risk: ${d.topRisk}`);
      lines.push(`   Recommended Next Step: ${d.recommendation}`);
      lines.push(`   Listing: ${d.url || "n/a"}`);
    });
  }

  lines.push("");
  lines.push("Performance Summary:");
  lines.push(`  Listings Reviewed: ${results.listingsFound}`);
  lines.push(`  Listings Rejected: ${results.rejected.length}`);
  lines.push(`  Qualified Deals: ${results.qualified}`);
  lines.push(`  Middle-Condition Targets Found: ${results.middleTargets}`);
  lines.push(`  Turnkey Rejected: ${results.turnkeyRejected}`);
  lines.push(`  Extreme/Critical Rejected: ${results.extremeRejected}`);
  lines.push(`  Need Photo Review: ${results.needPhotoReview}`);
  lines.push(`  Need Inspection: ${results.needInspection}`);
  lines.push(`  Best Opportunity: ${deals[0]?.address || "none"}`);
  lines.push("");
  lines.push(`Note: ${results.dataLimitations}`);

  // Optional: one short AI market observation. If it fails, we still have a full report.
  let observation = "";
  try {
    observation = await gemini.ask(
      `In ONE sentence, give a market observation for a fix-and-flip investor based on this: reviewed ${results.listingsFound}, buy-box ${results.buyBoxPassed}, qualified ${results.qualified} in SF/San Mateo/Sunnyvale. Be factual and brief.`
    );
  } catch {
    observation = "";
  }
  if (observation) {
    lines.push("");
    lines.push(`Main Market Observation: ${observation.trim()}`);
  }

  lines.push("");
  lines.push("Best regards,");
  lines.push("Twin Home Buyer Flip Scout");
  return lines.join("\n");
}

function fmt(n) {
  return Math.round(n || 0).toLocaleString();
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

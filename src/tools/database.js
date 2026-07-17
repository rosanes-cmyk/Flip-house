// Supabase REST client (no SDK needed — plain fetch against PostgREST).
// All writes are fire-and-forget-safe: failures are logged, not thrown, so one
// bad row never kills the daily run.

export class Database {
  constructor(url, key) {
    this.url = url ? url.replace(/\/$/, "") : null;
    this.key = key;
    this.enabled = Boolean(url && key);
  }

  #headers() {
    return {
      "Content-Type": "application/json",
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      Prefer: "return=minimal",
    };
  }

  async #insert(table, row) {
    if (!this.enabled) {
      console.log(`[db disabled] would insert into ${table}`);
      return;
    }
    try {
      const res = await fetch(`${this.url}/rest/v1/${table}`, {
        method: "POST",
        headers: this.#headers(),
        body: JSON.stringify(row),
      });
      if (!res.ok) {
        console.error(`db insert ${table} failed ${res.status}: ${await res.text()}`);
      }
    } catch (e) {
      console.error(`db insert ${table} error:`, e.message);
    }
  }

  saveListing(listing, result) {
    return this.#insert("listings", {
      address: listing.address || null,
      city: listing.city || null,
      price: listing.price || null,
      beds: listing.bedrooms || null,
      baths: listing.bathrooms || null,
      sqft: listing.squareFeet || null,
      property_type: listing.propertyType || null,
      source_url: listing.url || null,
      buy_box_passed: result.passed,
      rejection_reason: result.reason || null,
      scraped_at: new Date().toISOString(),
    });
  }

  saveDealAnalysis(a) {
    return this.#insert("deal_analyses", {
      address: a.address,
      price: a.price,
      arv_conservative: a.arv?.low ?? null,
      arv_base: a.arv?.expected ?? null,
      arv_optimistic: a.arv?.high ?? null,
      renovation_scope: a.reno?.scope ?? a.scope ?? null,
      renovation_expected: a.reno?.expected ?? null,
      total_cost: a.base?.totalProjectCost ?? null,
      net_profit: a.base?.netProfit ?? null,
      margin_on_cost: a.base?.marginOnCost ?? null,
      margin_on_resale: a.base?.marginOnResale ?? null,
      cash_required: a.cashRequired ?? null,
      max_allowable_offer: a.mao ?? null,
      score: a.score,
      confidence: a.confidence,
      // Condition strategy fields
      condition_category: a.conditionCategory ?? null,
      condition_category_key: a.conditionCategoryKey ?? null,
      condition_fit_score: a.conditionFitScore ?? null,
      strategy_fit: a.strategyFit ?? null,
      condition_gate: a.conditionGate ?? null,
      estimated_timeline: a.estimatedTimeline ?? null,
      condition_confidence: a.conditionConfidence ?? null,
      observation_source: a.observationSource ?? null,
      qualified: a.qualified,
      recommendation: a.recommendation,
      next_step: a.nextStep,
      comps: JSON.stringify(a.comps || []),
      risks: a.risks || null,
      analyzed_at: new Date().toISOString(),
    });
  }

  saveDailyReport(results) {
    return this.#insert("daily_reports", {
      report_date: new Date().toISOString().slice(0, 10),
      areas_searched: JSON.stringify(results.areasSearched || []),
      listings_found: results.listingsFound,
      buy_box_passed: results.buyBoxPassed,
      qualified: results.qualified,
      top_deals: JSON.stringify(results.topDeals || []),
      created_at: new Date().toISOString(),
    });
  }
}

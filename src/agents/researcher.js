// Research agent: finds listings, extracts details, finds comps, checks risks.
// Everything it returns is grounded in Gemini + Google Search with source links.
import { GeminiAI } from "../tools/gemini.js";
import { TARGET_AREAS, BUY_BOX } from "../config.js";

export class ResearchAgent {
  constructor(geminiKey) {
    this.gemini = new GeminiAI(geminiKey);
  }

  // Search every target neighborhood for candidate fixer listings.
  // Returns raw grounded text per area plus the set of source URLs found.
  async searchForListings() {
    const out = [];
    for (const [city, data] of Object.entries(TARGET_AREAS)) {
      for (const neighborhood of data.neighborhoods) {
        const prompt = `Find fixer-upper / value-add homes CURRENTLY for sale in ${neighborhood}, ${cityLabel(city)}, California.

Strict criteria:
- Asking price between $${BUY_BOX.minPrice.toLocaleString()} and $${BUY_BOX.maxPrice.toLocaleString()}
- Property type: single-family, duplex, triplex, fourplex, or small multifamily
- Bedrooms: ${BUY_BOX.minBeds} to ${BUY_BOX.maxBeds}
- Prefer listings mentioning: ${BUY_BOX.fixerKeywords.slice(0, 12).join(", ")}

Search Redfin, Zillow, and Realtor.com. For EACH property list:
- Full street address
- Asking price
- Beds / baths
- Square footage
- Property type
- Direct listing URL
- One line on condition from the description

Only include real, currently-listed properties with a source URL. If you cannot verify a property, do not list it.`;

        try {
          const { text, sources } = await this.gemini.searchAndAsk(prompt);
          out.push({ city, neighborhood, text, sources });
        } catch (e) {
          console.error(`search failed ${neighborhood}: ${e.message}`);
        }
        await sleep(1500); // be gentle on the free tier
      }
    }
    return out;
  }

  // Pull structured detail for a single listing URL.
  async extractListing(url) {
    const prompt = `Open and read this real estate listing: ${url}

Extract the property facts. Return JSON with these keys:
{
  "address": "full street address, city, state",
  "city": "city name",
  "price": number (asking price, no symbols),
  "bedrooms": number,
  "bathrooms": number,
  "squareFeet": number,
  "lotSize": number or null,
  "yearBuilt": number or null,
  "propertyType": "e.g. Single Family",
  "daysOnMarket": number or null,
  "description": "the full listing description text",
  "listingStatus": "active / pending / etc."
}
Use only what the page actually shows. Use null for anything not stated.`;
    const { text } = await this.gemini.searchAndAsk(prompt, 0.1);
    const parsed = tryJson(text);
    if (parsed) parsed.url = url;
    return parsed;
  }

  // Classify condition + value-add from the description (fast, no search).
  async classifyProperty({ description, price, squareFeet, yearBuilt }) {
    const prompt = `You are a conservative fix-and-flip underwriter. Analyze this property.

Price: $${price}
Living area: ${squareFeet} sqft
Year built: ${yearBuilt}
Description: "${(description || "").slice(0, 900)}"

Return JSON:
{
  "condition": "poor | fair | good | excellent | unknown",
  "renovationScope": "cosmetic | moderate | heavy",
  "confidence": "high | medium | low",
  "fixerSignals": ["keyword", ...],
  "redFlags": ["structural/foundation/fire/water/tenant/etc.", ...],
  "aduPotential": "strong | moderate | weak | unknown | not_practical",
  "expansionPotential": true | false,
  "extraBedBathPotential": true | false,
  "summary": "2-3 sentence conservative assessment"
}
Be conservative: when the description is thin, prefer "moderate" scope and "unknown" confidence.`;
    return this.gemini.askJson(prompt, {
      condition: "unknown",
      renovationScope: "moderate",
      confidence: "low",
      fixerSignals: [],
      redFlags: [],
      aduPotential: "unknown",
      expansionPotential: false,
      extraBedBathPotential: false,
      summary: "Insufficient description to assess.",
    });
  }

  // Find recent comparable SOLD sales for ARV.
  async findComps({ address, bedrooms, squareFeet }) {
    const prompt = `Find at least 5 recently SOLD comparable homes near ${address}.

Comp criteria:
- SOLD in the last 3-6 months
- Within about 1 mile
- Similar size (~${squareFeet} sqft) and bedroom count (~${bedrooms})
- Renovated or good condition (these represent After-Repair Value)

Return JSON:
{
  "comps": [
    {"address": "", "soldPrice": number, "soldDate": "YYYY-MM", "sqft": number, "beds": number, "baths": number, "pricePerSqft": number, "distanceMiles": number, "url": "", "why": "why comparable"}
  ]
}
Only include real sold sales you can source. If fewer than 3 exist, return what you find.`;
    const { text, sources } = await this.gemini.searchAndAsk(prompt, 0.2);
    const parsed = tryJson(text) || { comps: [] };
    parsed.sources = sources;
    return parsed;
  }

  // Public-records risk scan.
  async checkRisks({ address }) {
    const prompt = `Research fix-and-flip risks for ${address} using public records. Check and report:
1. FEMA flood zone
2. Seismic / liquefaction zone
3. Fire hazard severity zone
4. Zoning + local ADU rules
5. Open permits or code violations
6. Historic district status
7. Rent control / tenant occupancy
8. Any visible liens or title issues

For each, state the finding, severity (low/medium/high/unknown), and your source. Keep it concise. Do NOT invent facts — say "unknown / needs verification" when records are unavailable.`;
    const { text } = await this.gemini.searchAndAsk(prompt, 0.2);
    return text;
  }
}

function cityLabel(key) {
  return {
    san_francisco: "San Francisco",
    san_mateo: "San Mateo",
    sunnyvale: "Sunnyvale",
  }[key] || key;
}

function tryJson(text) {
  if (!text) return null;
  try {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s === -1 || e === -1) return null;
    return JSON.parse(text.slice(s, e + 1));
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Pull listing URLs (redfin/zillow/realtor) out of grounded search text.
export function extractListingUrls(text) {
  const matches = text.match(/https?:\/\/[^\s"')]+/g) || [];
  return [
    ...new Set(
      matches
        .map((u) => u.replace(/[.,)]+$/, ""))
        .filter(
          (u) =>
            u.includes("redfin.com") ||
            u.includes("zillow.com") ||
            u.includes("realtor.com")
        )
    ),
  ];
}

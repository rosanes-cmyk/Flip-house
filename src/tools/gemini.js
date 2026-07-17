// Thin wrapper around Google Gemini 2.0 Flash (free tier).
// Two modes: plain generation, and generation grounded with Google Search.

const MODEL = "gemini-2.0-flash";
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiAI {
  constructor(apiKey) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is missing");
    this.apiKey = apiKey;
  }

  async #call(body) {
    const url = `${BASE}/${MODEL}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const text =
      candidate?.content?.parts?.map((p) => p.text || "").join("") || "";
    const sources =
      candidate?.groundingMetadata?.groundingChunks?.map(
        (c) => c?.web?.uri || c?.web?.title || ""
      ) || [];
    return { text, sources };
  }

  // Plain text generation (no web search). Good for classification / writing.
  async ask(prompt, temperature = 0.3) {
    const { text } = await this.#call({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: 4000 },
    });
    return text;
  }

  // Grounded generation: Gemini runs Google Search and cites sources.
  async searchAndAsk(prompt, temperature = 0.3) {
    return this.#call({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature, maxOutputTokens: 4000 },
    });
  }

  // Ask for JSON and parse it defensively (models sometimes wrap in prose/fences).
  async askJson(prompt, fallback = {}) {
    const raw = await this.ask(
      prompt + "\n\nRespond with ONLY valid JSON. No prose, no markdown fences.",
      0.1
    );
    return safeParseJson(raw, fallback);
  }
}

export function safeParseJson(raw, fallback = {}) {
  if (!raw) return fallback;
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return fallback;
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return fallback;
  }
}

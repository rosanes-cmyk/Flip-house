// Flip Scout — one-button LOCAL app for Juan (same UI as the hosted version).
// Start with `npm start`, open the URL, click RUN. Shows ONLY qualified leads.
// No API key needed. Uses the bundled sample batch by default; set
// PROPERTIES_FILE=path\to\file.json to point at your own list.
import http from "node:http";
import { readFileSync } from "node:fs";
import { analyzeManualRecord } from "./src/manual.js";
import { appPage, leadsFromBatch } from "./src/ui.js";
import { PROPERTIES } from "./src/data/properties.js";
import { DATA_DISCLAIMER } from "./src/config.js";

const PORT = process.env.PORT || 8080;
const FILE = process.env.PROPERTIES_FILE || null;

function batch() {
  return FILE ? JSON.parse(readFileSync(FILE, "utf8")) : PROPERTIES;
}

http
  .createServer((req, res) => {
    if (req.url.startsWith("/leads") || req.url.startsWith("/api/run")) {
      try {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(leadsFromBatch(batch(), analyzeManualRecord, DATA_DISCLAIMER)));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(appPage("/leads"));
  })
  .listen(PORT, () => {
    console.log(`\n  Flip Scout is running.`);
    console.log(`  Open this in your browser:  http://localhost:${PORT}`);
    console.log(`  Then click the green RUN button.\n  (Press Ctrl+C to stop.)\n`);
  });

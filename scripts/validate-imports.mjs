// "Build"/validate step for a Cloudflare Worker project (no bundler needed):
// import every module so any syntax or import error fails fast.
const mods = [
  "../src/config.js",
  "../src/index.js",
  "../src/manual.js",
  "../src/agents/analyzer.js",
  "../src/agents/researcher.js",
  "../src/tools/calculator.js",
  "../src/tools/condition.js",
  "../src/tools/database.js",
  "../src/tools/email.js",
  "../src/tools/gemini.js",
];
let ok = 0;
for (const m of mods) {
  await import(new URL(m, import.meta.url).href);
  ok++;
}
console.log(`build OK — ${ok}/${mods.length} modules imported cleanly`);

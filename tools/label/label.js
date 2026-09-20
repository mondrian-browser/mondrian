// Label the corpus with Jev. NEXT.md B2, ADR 0009.
//
//   node tools/label/label.js              label every captured page not yet labelled
//   node tools/label/label.js <id>...      only these pages
//   --force                                relabel even if labels exist
//   --types <module>                       another type list (tools/label/taxonomies/*.js)
//
// Reads corpus/pages/<id>/regions.json (no browser involved), asks Jev one question per
// region and one per page, and writes corpus/pages/<id>/labels.json:
//
//   { model, types, labelledAt, application, regions: [ { index, choice, confidence,
//     margin, top: [[type, p], ...5] } ] }
//
// Then corpus/labels-summary.json and a printed summary: flagged counts by confidence and
// by top-two margin, the confidence quartiles, the type histogram, and the application
// score of every page against the tier it was given in pages.js.
//
// The questions are in questions.js and nowhere else. The state per region is the
// region description plus its two neighbours, as in the trial; the trial found that
// accuracy falls as the state fills with unrelated content, so the page is not sent.

'use strict';

const fs = require('fs');
const path = require('path');
const { ask, MODEL } = require('./jev');
const questions = require('./questions');

const ROOT = path.resolve(__dirname, '..', '..');
const CORPUS = path.join(ROOT, 'corpus');
const PAGES_DIR = path.join(CORPUS, 'pages');
const CONCURRENCY = 6;
const TIE_MARGIN = 0.1;      // top two within this: a true tie, flagged whatever the confidence

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const has = (name) => { const i = argv.indexOf(name); if (i < 0) return false; argv.splice(i, 1); return true; };
const FORCE = has('--force');
const TYPES_MODULE = flag('--types');
const ONLY = new Set(argv);
const BLOCK_TYPES = TYPES_MODULE ? require(path.resolve(TYPES_MODULE)) : questions.BLOCK_TYPES;
const LABEL = TYPES_MODULE ? path.basename(TYPES_MODULE, '.js') : 'questions';
const { REVIEW_BELOW, applicationQuestion } = questions;
const regionQuestion = () => ({ ...questions.regionQuestion(), criteria: BLOCK_TYPES });

// ---------------------------------------------------------------- helpers
const brief = (r) => r ? `${r.tag}${r.landmarks.length ? ' in ' + r.landmarks.join('>') : ''}: ${r.text.slice(0, 80).replace(/\n/g, ' ')}` : null;
const pad = (s, n) => { s = String(s ?? ''); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); };

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

// ---------------------------------------------------------------- one page
async function labelPage(id) {
  const dir = path.join(PAGES_DIR, id);
  const page = JSON.parse(fs.readFileSync(path.join(dir, 'regions.json'), 'utf8'));
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const regions = page.regions;
  const pageState = { page: { url: page.url, title: page.title } };
  let tokens = 0;

  const labelled = await mapLimit(regions, CONCURRENCY, async (r, i) => {
    const { index, ...region } = r;
    const state = { ...pageState, region: { ...region, before: brief(regions[i - 1]), after: brief(regions[i + 1]) } };
    const res = await ask(state, { type: regionQuestion() });
    const a = res.answers.type;
    tokens += res.usage ? res.usage.input_tokens : 0;
    const ranked = Object.entries(a.probabilities).sort((x, y) => y[1] - x[1]);
    const margin = ranked.length > 1 ? +(ranked[0][1] - ranked[1][1]).toFixed(3) : 1;
    return { index: i, choice: a.choice, confidence: +a.confidence.toFixed(3), margin, top: ranked.slice(0, 5).map(([t, p]) => [t, +p.toFixed(3)]) };
  });

  let application = null;
  if (regions.length) {
    const summary = regions.map((r) => `${r.tag}${r.landmarks.length ? '(' + r.landmarks.join('>') + ')' : ''} ${r.textLength}ch ${r.counts.links}a ${r.counts.controls}ctl`).join('; ');
    const res = await ask({ page: { ...pageState.page, regionCount: regions.length, regions: summary } }, { app: applicationQuestion() });
    application = +res.answers.app.noul.toFixed(3);
    tokens += res.usage ? res.usage.input_tokens : 0;
  }

  const out = { id, model: MODEL, types: LABEL, typeCount: Object.keys(BLOCK_TYPES).length, labelledAt: new Date().toISOString(), tier: meta.tier, application, inputTokens: tokens, regions: labelled };
  fs.writeFileSync(path.join(dir, 'labels.json'), JSON.stringify(out, null, 1));
  return out;
}

// ---------------------------------------------------------------- summary
function summarise() {
  const pages = fs.readdirSync(PAGES_DIR).filter((id) => fs.existsSync(path.join(PAGES_DIR, id, 'labels.json'))).map((id) => JSON.parse(fs.readFileSync(path.join(PAGES_DIR, id, 'labels.json'), 'utf8')));
  const all = pages.flatMap((p) => p.regions);
  const conf = all.map((a) => a.confidence).sort((a, b) => a - b);
  const q = (p) => conf[Math.min(conf.length - 1, Math.floor(p * conf.length))];
  const byType = {};
  for (const a of all) byType[a.choice] = (byType[a.choice] || 0) + 1;
  const lowConf = all.filter((a) => a.confidence < REVIEW_BELOW).length;
  const ties = all.filter((a) => a.margin < TIE_MARGIN).length;
  const flagged = all.filter((a) => a.confidence < REVIEW_BELOW || a.margin < TIE_MARGIN).length;
  const tokens = pages.reduce((n, p) => n + p.inputTokens, 0);
  const unused = Object.keys(BLOCK_TYPES).filter((t) => !byType[t]);
  const summary = {
    updatedAt: new Date().toISOString(), model: MODEL, types: LABEL, typeCount: Object.keys(BLOCK_TYPES).length,
    pages: pages.length, regions: all.length,
    flagged: { lowConfidence: lowConf, ties, either: flagged, reviewBelow: REVIEW_BELOW, tieMargin: TIE_MARGIN },
    confidence: { min: q(0), p25: q(0.25), median: q(0.5), p75: q(0.75), max: conf[conf.length - 1] },
    inputTokens: tokens, estimatedCostUsd: +(tokens * 0.042 / 1e6).toFixed(3),
    byType: Object.fromEntries(Object.entries(byType).sort((a, b) => b[1] - a[1])),
    unusedTypes: unused,
    application: pages.map((p) => ({ id: p.id, tier: p.tier, application: p.application })).sort((a, b) => (b.application ?? -1) - (a.application ?? -1)),
  };
  fs.writeFileSync(path.join(CORPUS, 'labels-summary.json'), JSON.stringify(summary, null, 2));

  console.log(`\n${'='.repeat(100)}\nLABELS  model ${MODEL}   types ${summary.typeCount} (${LABEL})   pages ${pages.length}   regions ${all.length}`);
  console.log(`flagged  confidence<${REVIEW_BELOW}: ${lowConf} (${pct(lowConf, all.length)})   ties (margin<${TIE_MARGIN}): ${ties} (${pct(ties, all.length)})   either: ${flagged} (${pct(flagged, all.length)})`);
  console.log(`confidence  min ${q(0).toFixed(2)}  p25 ${q(0.25).toFixed(2)}  median ${q(0.5).toFixed(2)}  p75 ${q(0.75).toFixed(2)}`);
  console.log(`input tokens ${tokens}   est. cost $${summary.estimatedCostUsd}`);
  console.log(`types used ${Object.keys(byType).length}/${summary.typeCount}; unused: ${unused.join(' ') || 'none'}`);
  console.log('by type  ' + Object.entries(summary.byType).map(([k, v]) => `${k} ${v}`).join('  '));
  console.log(`\napplication score by page (tier from pages.js):`);
  for (const p of summary.application) {
    const odd = p.application !== null && (p.tier === 'contained' && p.application < 0.5) || (p.tier === 'relayout' && p.application > 0.5);
    console.log(`  ${pad(p.application === null ? '-' : p.application.toFixed(2), 5)} ${pad(p.tier, 10)} ${pad(p.id, 24)}${odd ? '  <- disagrees with tier' : ''}`);
  }
  return summary;
}
const pct = (n, d) => d ? Math.round(100 * n / d) + '%' : '-';

// ---------------------------------------------------------------- run
(async () => {
  const ids = fs.readdirSync(PAGES_DIR).filter((id) => fs.existsSync(path.join(PAGES_DIR, id, 'regions.json')));
  const todo = ids.filter((id) => (ONLY.size === 0 || ONLY.has(id)) && (FORCE || !fs.existsSync(path.join(PAGES_DIR, id, 'labels.json'))));
  const total = todo.reduce((n, id) => n + JSON.parse(fs.readFileSync(path.join(PAGES_DIR, id, 'regions.json'), 'utf8')).regions.length, 0);
  console.log(`types: ${Object.keys(BLOCK_TYPES).length} (${LABEL})   pages: ${todo.length} of ${ids.length}   regions: ${total}`);
  const failures = [];
  for (const id of todo) {
    process.stdout.write(`${pad(id, 24)} `);
    try {
      const out = await labelPage(id);
      const fl = out.regions.filter((a) => a.confidence < REVIEW_BELOW || a.margin < TIE_MARGIN).length;
      console.log(`${out.regions.length} regions, ${fl} flagged, app ${out.application === null ? '-' : out.application.toFixed(2)}`);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
      failures.push(id);
    }
  }
  summarise();
  if (failures.length) console.log(`\nfailed: ${failures.join(', ')}  (rerun with those ids)`);
})().catch((e) => { console.error(e); process.exit(1); });

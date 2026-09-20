// Compare two trial runs region by region.
//
//   node tools/label/compare.js <before.json> <after.json>
//   node tools/label/compare.js            the two most recent runs
//
// Regions are matched by page URL and the first 60 characters of their text, so a page
// that changed between runs (a news index) still lines up where it can. Reports the
// summary delta, which regions lost confidence, which gained, which changed label, and
// the pairs of types the after-run confuses most, which is the list to sharpen or merge.

'use strict';

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', '.runtime', 'label-trial');

function load(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = new Map();
  for (const page of j.results) {
    if (page.error) continue;
    for (const a of page.answers) {
      const r = page.regions[a.index];
      const key = page.url + '|' + r.text.slice(0, 60);
      rows.set(key, { page: page.title, url: page.url, tag: r.tag, text: r.text.slice(0, 50).replace(/\n/g, ' '), ...a });
    }
  }
  return { label: j.label || path.basename(file), types: j.types ? j.types.length : '?', reviewBelow: j.reviewBelow, rows, pages: j.results.filter((p) => !p.error).length };
}

function stats(rows, below) {
  const c = [...rows.values()].map((a) => a.confidence).sort((x, y) => x - y);
  const q = (p) => c[Math.min(c.length - 1, Math.floor(p * c.length))];
  const flagged = c.filter((x) => x < below).length;
  return { n: c.length, flagged, pct: Math.round(100 * flagged / c.length), min: q(0), p25: q(0.25), median: q(0.5), p75: q(0.75) };
}

const args = process.argv.slice(2);
let [before, after] = args;
if (!before || !after) {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
  if (files.length < 2) { console.error('need two runs in ' + DIR); process.exit(1); }
  before = path.join(DIR, files[files.length - 2]);
  after = path.join(DIR, files[files.length - 1]);
}
const A = load(before), B = load(after);
const below = B.reviewBelow || 0.5;
const sa = stats(A.rows, below), sb = stats(B.rows, below);
const f2 = (x) => x.toFixed(2);

console.log(`before  ${A.label}  ${A.types} types  ${A.pages} pages  ${sa.n} regions  flagged ${sa.flagged} (${sa.pct}%)  min ${f2(sa.min)} p25 ${f2(sa.p25)} median ${f2(sa.median)} p75 ${f2(sa.p75)}`);
console.log(`after   ${B.label}  ${B.types} types  ${B.pages} pages  ${sb.n} regions  flagged ${sb.flagged} (${sb.pct}%)  min ${f2(sb.min)} p25 ${f2(sb.p25)} median ${f2(sb.median)} p75 ${f2(sb.p75)}`);

// Matched regions only, for the paired comparison.
const paired = [];
for (const [k, a] of A.rows) if (B.rows.has(k)) paired.push({ a, b: B.rows.get(k) });
const delta = paired.map((p) => p.b.confidence - p.a.confidence);
const mean = delta.reduce((s, d) => s + d, 0) / (delta.length || 1);
const up = delta.filter((d) => d > 0.1).length, down = delta.filter((d) => d < -0.1).length;
const relabelled = paired.filter((p) => p.a.choice !== p.b.choice);
const newlyFlagged = paired.filter((p) => p.a.confidence >= below && p.b.confidence < below);
const unflagged = paired.filter((p) => p.a.confidence < below && p.b.confidence >= below);
console.log(`\npaired ${paired.length} regions   mean Δconfidence ${mean >= 0 ? '+' : ''}${f2(mean)}   up>0.1 ${up}   down>0.1 ${down}   relabelled ${relabelled.length}   newly flagged ${newlyFlagged.length}   unflagged ${unflagged.length}`);

const pad = (s, n) => { s = String(s ?? ''); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); };
const row = (p) => `${pad(p.a.choice, 18)} ${f2(p.a.confidence)} → ${pad(p.b.choice, 18)} ${f2(p.b.confidence)}   ${pad(p.b.tag, 11)} ${pad(p.b.page, 22)} ${p.b.text}`;

const lost = paired.filter((p) => p.b.confidence - p.a.confidence < -0.15).sort((x, y) => (y.a.confidence - y.b.confidence) - (x.a.confidence - x.b.confidence));
if (lost.length) { console.log(`\nLOST CONFIDENCE (${lost.length})`); for (const p of lost) console.log('  ' + row(p)); }

const gained = paired.filter((p) => p.b.confidence - p.a.confidence > 0.15).sort((x, y) => (y.b.confidence - y.a.confidence) - (x.b.confidence - x.a.confidence));
if (gained.length) { console.log(`\nGAINED CONFIDENCE (${gained.length})`); for (const p of gained) console.log('  ' + row(p)); }

const moved = relabelled.filter((p) => !lost.includes(p) && !gained.includes(p));
if (moved.length) { console.log(`\nRELABELLED, SIMILAR CONFIDENCE (${moved.length})`); for (const p of moved) console.log('  ' + row(p)); }

// Confusion pairs in the after run: for every flagged region, the top two types.
const pairs = {};
for (const b of B.rows.values()) {
  if (b.confidence >= below || !b.top2 || b.top2.length < 2) continue;
  const k = [b.top2[0][0], b.top2[1][0]].sort().join(' / ');
  pairs[k] = (pairs[k] || 0) + 1;
}
const top = Object.entries(pairs).sort((x, y) => y[1] - x[1]);
if (top.length) { console.log(`\nCONFUSED PAIRS IN AFTER RUN (flagged regions, top two types)`); for (const [k, n] of top) console.log(`  ${pad(n, 3)} ${k}`); }

// Types never chosen in the after run.
const used = new Set([...B.rows.values()].map((b) => b.choice));
const j = JSON.parse(fs.readFileSync(after, 'utf8'));
if (j.types) {
  const unused = j.types.filter((t) => !used.has(t));
  console.log(`\nUNUSED TYPES IN AFTER RUN (${unused.length}/${j.types.length}): ${unused.join(' ')}`);
}

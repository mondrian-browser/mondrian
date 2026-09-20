// Draw a reproducible random sample of regions from a trial run for accuracy review.
//
//   node tools/label/sample.js <run.json> [n=150] [seed=1]     prints the review table
//   node tools/label/sample.js <run.json> --score <judgements.json>
//
// Judgements are { "<id>": "ok" | "either" | "wrong:<type>" | "unsure" } where id is
// page index + region index, e.g. "7:23". "either" means the label and the runner-up are
// both acceptable. "unsure" is routed to Lloyd. --score reports accuracy overall, per type,
// and the confusions, and lists the unsure rows for review.

'use strict';

const fs = require('fs');

const [file, ...rest] = process.argv.slice(2);
if (!file) { console.error('usage: sample.js <run.json> [n] [seed] | --score <judgements.json>'); process.exit(1); }
const run = JSON.parse(fs.readFileSync(file, 'utf8'));

const rows = [];
run.results.forEach((page, pi) => {
  if (page.error) return;
  for (const a of page.answers) {
    const r = page.regions[a.index];
    rows.push({ id: `${pi}:${a.index}`, page: page.title.slice(0, 28), url: page.url, r, a });
  }
});

function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }
function sample(arr, n, seed) {
  const rand = rng(seed);
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy.slice(0, n).sort((x, y) => x.id.localeCompare(y.id, undefined, { numeric: true }));
}

const pad = (s, n) => { s = String(s ?? ''); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); };

if (rest[0] === '--score') {
  const judged = JSON.parse(fs.readFileSync(rest[1], 'utf8'));
  const byId = Object.fromEntries(rows.map((x) => [x.id, x]));
  const ids = Object.keys(judged);
  const counts = { ok: 0, either: 0, wrong: 0, unsure: 0 };
  const perType = {};
  const confusions = {};
  const flaggedStats = { flagged: { n: 0, wrong: 0 }, clear: { n: 0, wrong: 0 } };
  for (const id of ids) {
    const v = judged[id]; const x = byId[id]; if (!x) continue;
    const k = v.startsWith('wrong') ? 'wrong' : v;
    counts[k]++;
    const t = x.a.choice;
    perType[t] = perType[t] || { n: 0, ok: 0, either: 0, wrong: 0, unsure: 0 };
    perType[t].n++; perType[t][k]++;
    if (k === 'wrong') { const should = v.split(':')[1] || '?'; const key = `${t} → ${should}`; confusions[key] = (confusions[key] || 0) + 1; }
    const bucket = x.a.confidence < run.reviewBelow ? 'flagged' : 'clear';
    flaggedStats[bucket].n++; if (k === 'wrong') flaggedStats[bucket].wrong++;
  }
  const n = ids.length, decided = n - counts.unsure;
  console.log(`judged ${n}   ok ${counts.ok}   either ${counts.either}   wrong ${counts.wrong}   unsure ${counts.unsure}`);
  console.log(`accuracy (ok / decided)            ${Math.round(100 * counts.ok / decided)}%`);
  console.log(`accuracy (ok+either / decided)     ${Math.round(100 * (counts.ok + counts.either) / decided)}%`);
  console.log(`wrong rate among clear (≥${run.reviewBelow})   ${flaggedStats.clear.wrong}/${flaggedStats.clear.n} = ${Math.round(100 * flaggedStats.clear.wrong / (flaggedStats.clear.n || 1))}%`);
  console.log(`wrong rate among flagged (<${run.reviewBelow}) ${flaggedStats.flagged.wrong}/${flaggedStats.flagged.n} = ${Math.round(100 * flaggedStats.flagged.wrong / (flaggedStats.flagged.n || 1))}%`);
  console.log('\nPER TYPE (n ok either wrong unsure)');
  for (const [t, c] of Object.entries(perType).sort((a, b) => b[1].n - a[1].n)) console.log(`  ${pad(t, 20)} ${pad(c.n, 4)} ${pad(c.ok, 4)} ${pad(c.either, 4)} ${pad(c.wrong, 4)} ${c.unsure}`);
  console.log('\nCONFUSIONS (labelled → should be)');
  for (const [k, c] of Object.entries(confusions).sort((a, b) => b[1] - a[1])) console.log(`  ${pad(c, 3)} ${k}`);
  const unsure = ids.filter((id) => judged[id] === 'unsure');
  if (unsure.length) {
    console.log(`\nFOR LLOYD (${unsure.length})`);
    for (const id of unsure) { const x = byId[id]; console.log(`  ${pad(id, 6)} ${pad(x.a.choice, 16)} ${x.a.confidence.toFixed(2)}  ${pad(x.r.tag, 10)} ${pad(x.page, 28)} ${x.url}\n         ${x.r.text.slice(0, 200).replace(/\n/g, ' | ')}`); }
  }
  process.exit(0);
}

const n = +rest[0] || 150, seed = +rest[1] || 1;
const picked = sample(rows, n, seed);
console.log(`sample ${picked.length} of ${rows.length} regions, seed ${seed}\n`);
for (const x of picked) {
  const c = x.r.counts;
  const where = x.r.landmarks.join('>') || (x.r.geometry.aboveFold ? 'above fold' : `${Math.round(x.r.geometry.pageFraction * 100)}% down`);
  const facts = `${c.links}a ${c.images}img ${c.headings}h ${c.listItems}li ${c.tableRows}tr ${c.controls}ctl ${c.paragraphs}p ×${c.repeats} ${x.r.textLength}ch`;
  const ru = x.a.top2[1] ? `${x.a.top2[1][0]} ${x.a.top2[1][1].toFixed(2)}` : '';
  console.log(`${pad(x.id, 6)} ${pad(x.a.choice, 17)} ${x.a.confidence.toFixed(2)}  ${pad(ru, 22)} ${pad(x.r.tag, 11)} ${pad(where, 24)} ${pad(x.page, 28)} ${facts}`);
  console.log(`       ${x.r.text.slice(0, 230).replace(/\n/g, ' | ')}`);
}

// Audit every hint and text regex in features.js against the labels.
//
//   node tools/classify/audit-hints.js            every hint with n >= 5, worst first
//   node tools/classify/audit-hints.js --min 10   only hints matching at least 10 regions
//
// For each HINT (class/id/role/aria words) and TEXT regex: how many regions it matches,
// which final types those regions have, and the precision of its top type. A hint whose
// top type is under a third of its matches is not telling the classifier anything and
// is probably firing on the wrong word ("graph" inside "paragraph" was one). The point
// is to prune by evidence rather than by taste.

'use strict';

const { loadPages } = require('./corpus');
const { features, siteIndex, HINTS, TEXT } = require('./features');

const argv = process.argv.slice(2);
const i = argv.indexOf('--min');
const MIN = i >= 0 ? Number(argv[i + 1]) : 5;

const pages = loadPages();
const index = siteIndex(pages);
const stat = {};
for (const p of pages) {
  const byIndex = new Map(p.labels.map((a) => [a.index, a.final]));
  for (let k = 0; k < p.regions.length; k++) {
    const final = byIndex.get(k);
    if (!final) continue;
    const f = features(p, k, index);
    for (const name of Object.keys(HINTS)) if (f.h(name)) tally(`h:${name}`, final, p.site);
    for (const name of Object.keys(TEXT)) if (f.tx(name)) tally(`t:${name}`, final, p.site);
  }
}
function tally(key, final, site) {
  const s = stat[key] = stat[key] || { n: 0, types: {}, sites: new Set() };
  s.n++; s.types[final] = (s.types[final] || 0) + 1; s.sites.add(site);
}

const rows = Object.entries(stat).filter(([, s]) => s.n >= MIN).map(([key, s]) => {
  const top = Object.entries(s.types).sort((a, b) => b[1] - a[1]);
  return { key, n: s.n, sites: s.sites.size, top, precision: top[0][1] / s.n };
}).sort((a, b) => a.precision - b.precision);
const pad = (x, n) => { x = String(x); return x.length >= n ? x.slice(0, n) : x + ' '.repeat(n - x.length); };
console.log(`${pad('hint', 20)} ${pad('n', 5)} ${pad('sites', 5)} ${pad('top', 6)} types`);
for (const r of rows) console.log(`${pad(r.key, 20)} ${pad(r.n, 5)} ${pad(r.sites, 5)} ${pad((100 * r.precision).toFixed(0) + '%', 6)} ${r.top.slice(0, 4).map(([t, c]) => `${t} ${c}`).join('  ')}`);

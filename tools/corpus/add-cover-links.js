// Add covering anchors to a frozen corpus's regions.json, offline.
//
//   node tools/corpus/add-cover-links.js [id...]
//
// The extractor now counts anchors that wrap a region or lie over half of it
// (`counts.coverLinks`) and keeps the first one's aria-label (`coverLabel`); the 20 Sep
// 2026 capture predates that. dom.html has every anchor with its box, so the same two
// fields can be computed from geometry: an anchor covers a region when their boxes
// overlap by at least half the region's area and the anchor has no visible text of its
// own in the region (its text length is under 4, or it is larger than the region, which
// is the wrapping case). Fields are added in place; nothing moves or is removed.
// Idempotent.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PAGES_DIR = path.join(ROOT, 'corpus', 'pages');
const ONLY = new Set(process.argv.slice(2));

function anchors(dom) {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(dom))) {
    const a = m[1];
    if (/data-mx-h="1"/.test(a) || !/ href="/.test(a)) continue;
    const rect = (a.match(/data-mx-r="([^"]*)"/) || [])[1];
    if (!rect) continue;
    const [l, t, w, h] = rect.split(',').map(Number);
    if (w < 20 || h < 10) continue;
    const label = ((a.match(/ aria-label="([^"]*)"/) || a.match(/ title="([^"]*)"/) || [])[1] || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
    const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    out.push({ l, t, w, h, area: w * h, label, textLen: text.length });
  }
  return out;
}

let pages = 0, regionsTouched = 0;
for (const id of fs.readdirSync(PAGES_DIR)) {
  if (ONLY.size && !ONLY.has(id)) continue;
  const dir = path.join(PAGES_DIR, id);
  const domFile = path.join(dir, 'dom.html'), regFile = path.join(dir, 'regions.json');
  if (!fs.existsSync(domFile) || !fs.existsSync(regFile)) continue;
  const page = JSON.parse(fs.readFileSync(regFile, 'utf8'));
  const vw = page.viewport.width || 1;
  const as = anchors(fs.readFileSync(domFile, 'utf8'));
  let n = 0;
  for (const r of page.regions) {
    const g = r.geometry;
    const rl = g.leftFraction * vw, rw = Math.max(g.widthFraction * vw, 1), rt = g.top, rh = Math.max(g.height, 1);
    const area = rw * rh;
    let count = 0, label;
    for (const a of as) {
      const ix = Math.max(0, Math.min(rl + rw, a.l + a.w) - Math.max(rl, a.l));
      const iy = Math.max(0, Math.min(rt + rh, a.t + a.h) - Math.max(rt, a.t));
      const inter = ix * iy;
      // Covers the region, or sits inside it at member size (a run of cards, each
      // wrapped in its own anchor). Small text links inside prose fail the size gate.
      const member = area / Math.max(r.counts.repeats || 1, 1);
      if (!(inter >= area * 0.5 || inter >= a.area * 0.9 && a.area >= member * 0.4)) continue;
      count++;
      if (!label && a.label) label = a.label.slice(0, 120);
    }
    if (r.counts.coverLinks !== count || (label || undefined) !== r.coverLabel) n++;
    r.counts.coverLinks = count;
    if (label) r.coverLabel = label; else delete r.coverLabel;
  }
  if (n) { fs.writeFileSync(regFile, JSON.stringify(page, null, 1)); pages++; regionsTouched += n; }
}
console.log(`${regionsTouched} regions updated on ${pages} pages`);

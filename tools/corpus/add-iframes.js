// Append visible cross-origin iframes to a frozen corpus's regions.json, offline.
//
//   node tools/corpus/add-iframes.js          every captured page
//   node tools/corpus/add-iframes.js <id>...  only these
//
// The extractor used for the 20 Sep 2026 capture dropped any region with no text and no
// pictures, which is every cross-origin frame: consent walls, video embeds, live code
// examples, chat bots. dom.html has the frames with their geometry and src, so they can be
// added without recapturing (a recapture would change every other region on the page and
// invalidate its labels). Each added region has the same shape as an extractor region,
// plus `added: "iframe"`, and is appended after the existing ones so indices already in
// labels.json and the judgement files stay valid. Then label them:
//
//   node tools/label/label.js --new
//
// Idempotent: a frame already present (by geometry) is not added twice. Frames under 80px
// in either dimension are skipped, as in the extractor.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PAGES_DIR = path.join(ROOT, 'corpus', 'pages');
const MIN = 80;
const ONLY = new Set(process.argv.slice(2));

let pages = 0, added = 0;
for (const id of fs.readdirSync(PAGES_DIR)) {
  if (ONLY.size && !ONLY.has(id)) continue;
  const dir = path.join(PAGES_DIR, id);
  const domFile = path.join(dir, 'dom.html');
  const regFile = path.join(dir, 'regions.json');
  if (!fs.existsSync(domFile) || !fs.existsSync(regFile)) continue;
  const dom = fs.readFileSync(domFile, 'utf8');
  const page = JSON.parse(fs.readFileSync(regFile, 'utf8'));
  const vw = page.viewport.width || 1;
  const vh = page.viewport.height || 1;
  const have = new Set(page.regions.filter((r) => r.frame).map((r) => `${r.geometry.top}:${r.geometry.height}`));
  const re = /<iframe([^>]*)>/g;
  let m, n = 0;
  while ((m = re.exec(dom))) {
    const a = m[1];
    if (/data-mx-h="1"/.test(a)) continue;
    const rect = (a.match(/data-mx-r="([^"]*)"/) || [])[1];
    if (!rect) continue;
    const [left, top, width, height] = rect.split(',').map(Number);
    if (width < MIN || height < MIN) continue;
    if (have.has(`${top}:${height}`)) continue;
    const src = (a.match(/src="([^"]*)"/) || [])[1] || '';
    let host = '';
    try { host = new URL(src.replace(/&amp;/g, '&'), page.url).host.replace(/^www\./, ''); } catch (_) {}
    const attr = (name) => ((a.match(new RegExp(` ${name}="([^"]*)"`)) || [])[1] || '').slice(0, 80) || undefined;
    page.regions.push({
      index: page.regions.length,
      tag: 'iframe',
      id: attr('id'),
      class: attr('class') && attr('class').split(/\s+/).slice(0, 4).join(' '),
      role: attr('role'),
      ariaLabel: attr('aria-label'),
      landmarks: [],
      textLength: 0,
      text: '',
      counts: { links: 0, images: 0, headings: 0, listItems: 0, tableRows: 0, controls: 0, paragraphs: 0, repeats: 1 },
      frame: { host, width, height, title: attr('title') },
      linkTextRatio: 0,
      geometry: {
        top, height,
        widthFraction: +(Math.min(width, vw) / vw).toFixed(2),
        leftFraction: +(left / vw).toFixed(2),
        pageFraction: +(top / Math.max(page.pageHeight, 1)).toFixed(2),
        aboveFold: top < vh,
      },
      added: 'iframe',
    });
    n++;
  }
  if (n) {
    fs.writeFileSync(regFile, JSON.stringify(page, null, 1));
    console.log(`${id.padEnd(24)} +${n} iframe region${n > 1 ? 's' : ''}`);
    pages++; added += n;
  }
}
console.log(`${added} regions added on ${pages} pages`);

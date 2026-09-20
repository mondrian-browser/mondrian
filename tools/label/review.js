// Review Jev's corpus labels. NEXT.md B2.
//
//   node tools/label/review.js                       print the flagged regions (low confidence or a tie)
//   node tools/label/review.js --sample 150 [seed]   print a random sample of the unflagged ones instead
//   node tools/label/review.js --score <judgements.json>
//   node tools/label/review.js --apply <judgements.json>   write verdicts into labels.json as `review` and `final`
//   --json <file>                                    also write the printed rows as JSON
//
// Judgements are { "<pageId>:<index>": "ok" | "either" | "wrong:<type>" | "unsure" }.
// "either" means the label and the runner-up are both acceptable. "unsure" is routed to
// Lloyd. --score reports accuracy overall, flagged against unflagged, per type, and the
// confusions; the judgement files live in tools/label/judgements/.

'use strict';

const fs = require('fs');
const path = require('path');
const { REVIEW_BELOW } = require('./questions');
const { POLICIES } = require('./policies');
const { deriveAxes } = require('./axes');

const ROOT = path.resolve(__dirname, '..', '..');
const PAGES_DIR = path.join(ROOT, 'corpus', 'pages');
const TIE_MARGIN = 0.1;

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const SCORE = flag('--score');
const APPLY = flag('--apply');
const JSON_OUT = flag('--json');
const SAMPLE = flag('--sample');
const SEED = Number(argv[0]) || 1;

// ---------------------------------------------------------------- load
const rows = [];
for (const id of fs.readdirSync(PAGES_DIR)) {
  const lf = path.join(PAGES_DIR, id, 'labels.json');
  if (!fs.existsSync(lf)) continue;
  const labels = JSON.parse(fs.readFileSync(lf, 'utf8'));
  const { regions } = JSON.parse(fs.readFileSync(path.join(PAGES_DIR, id, 'regions.json'), 'utf8'));
  for (const a of labels.regions) {
    const r = regions[a.index];
    rows.push({ id: `${id}:${a.index}`, page: id, r, a, flagged: a.confidence < REVIEW_BELOW || a.margin < TIE_MARGIN });
  }
}

function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }
function sample(arr, n, seed) {
  const rand = rng(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}
const pad = (s, n) => { s = String(s ?? ''); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); };
const where = (r) => r.landmarks.join('>') || (r.geometry.aboveFold ? 'above fold' : `${Math.round(r.geometry.pageFraction * 100)}% down`);

// ---------------------------------------------------------------- print
function print(list) {
  console.log(`${pad('id', 26)} ${pad('label', 18)} ${pad('conf', 5)} ${pad('runner-up', 22)} ${pad('tag', 10)} ${pad('where', 20)} text`);
  for (const x of list) {
    const ru = x.a.top[1] ? `${x.a.top[1][0]} ${x.a.top[1][1].toFixed(2)}` : '';
    console.log(`${pad(x.id, 26)} ${pad(x.a.choice, 18)} ${pad(x.a.confidence.toFixed(2), 5)} ${pad(ru, 22)} ${pad(x.r.tag, 10)} ${pad(where(x.r), 20)} ${x.r.text.slice(0, 110).replace(/\n/g, ' | ')}`);
  }
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(list.map((x) => ({ id: x.id, label: x.a.choice, confidence: x.a.confidence, margin: x.a.margin, top: x.a.top.slice(0, 3), tag: x.r.tag, where: where(x.r), counts: x.r.counts, images: x.r.images, textLength: x.r.textLength, text: x.r.text.slice(0, 300) })), null, 1));
}

// ---------------------------------------------------------------- score
function score(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const byId = new Map(rows.map((x) => [x.id, x]));
  const tally = { ok: 0, either: 0, wrong: 0, unsure: 0 };
  const perType = {};
  const confusions = {};
  const groups = { flagged: { n: 0, wrong: 0 }, unflagged: { n: 0, wrong: 0 } };
  const unsure = [];
  for (const [id, v] of Object.entries(j)) {
    const x = byId.get(id);
    if (!x) { console.log(`no such region ${id}`); continue; }
    const verdict = v.split(':')[0];
    tally[verdict] = (tally[verdict] || 0) + 1;
    const t = x.a.choice;
    perType[t] = perType[t] || { n: 0, ok: 0, either: 0, wrong: 0 };
    perType[t].n++;
    if (verdict in perType[t]) perType[t][verdict]++;
    const g = x.flagged ? groups.flagged : groups.unflagged;
    g.n++;
    if (verdict === 'wrong') { g.wrong++; const k = `${t} -> ${v.split(':')[1] || '?'}`; confusions[k] = (confusions[k] || 0) + 1; }
    if (verdict === 'unsure') unsure.push(x);
  }
  const n = tally.ok + tally.either + tally.wrong;
  console.log(`judged ${Object.keys(j).length}: ok ${tally.ok}  either ${tally.either}  wrong ${tally.wrong}  unsure ${tally.unsure}`);
  if (n) console.log(`top label right ${Math.round(100 * tally.ok / n)}%   right-or-acceptable ${Math.round(100 * (tally.ok + tally.either) / n)}%   wrong ${Math.round(100 * tally.wrong / n)}%`);
  for (const [k, g] of Object.entries(groups)) if (g.n) console.log(`${k}: ${g.n} judged, ${g.wrong} wrong (${Math.round(100 * g.wrong / g.n)}%)`);
  console.log('\nper type (n ok either wrong):');
  for (const [t, c] of Object.entries(perType).sort((a, b) => b[1].n - a[1].n)) console.log(`  ${pad(t, 20)} ${pad(c.n, 4)} ${pad(c.ok, 4)} ${pad(c.either, 4)} ${c.wrong}`);
  console.log('\nconfusions (label -> should be):');
  for (const [k, c] of Object.entries(confusions).sort((a, b) => b[1] - a[1])) console.log(`  ${pad(k, 40)} ${c}`);
  if (unsure.length) { console.log('\nunsure, for Lloyd:'); print(unsure); }
}

// ---------------------------------------------------------------- apply
// Write the verdicts into labels.json. Every region gets `final` (the corrected type, or
// Jev's choice) and judged ones get `review`. Jev's own output is kept untouched.
function apply(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  let judged = 0, corrected = 0, policed = 0;
  for (const id of fs.readdirSync(PAGES_DIR)) {
    const lf = path.join(PAGES_DIR, id, 'labels.json');
    if (!fs.existsSync(lf)) continue;
    const labels = JSON.parse(fs.readFileSync(lf, 'utf8'));
    const regions = JSON.parse(fs.readFileSync(path.join(PAGES_DIR, id, 'regions.json'), 'utf8')).regions;
    for (const a of labels.regions) {
      const v = j[`${id}:${a.index}`];
      delete a.review; delete a.final; delete a.policy;
      if (v) {
        judged++;
        const [verdict, type] = v.split(':');
        a.review = verdict;
        if (verdict === 'wrong' && type) { a.final = type; corrected++; continue; }
      }
      a.final = a.choice;
    }
    // Then the policies (policies.js), which are definitions rather than judgements.
    for (const a of labels.regions) {
      const r = regions[a.index];
      for (const [name, rule] of Object.entries(POLICIES)) {
        const t = rule(r, a.final, regions[a.index - 1], regions[a.index + 1]);
        if (t && t !== a.final) { a.final = t; a.policy = name; policed++; break; }
      }
    }
    // Then the two axes (axes.js) from the finals, in page order.
    const axes = deriveAxes(regions, labels.regions.map((a) => a.final));
    labels.regions.forEach((a, k) => { a.block = axes[k].block; a.slot = axes[k].slot; });
    labels.reviewedAt = new Date().toISOString();
    labels.reviewFile = path.relative(ROOT, file).split(path.sep).join('/');
    fs.writeFileSync(lf, JSON.stringify(labels, null, 1));
  }
  console.log(`applied ${judged} judgements, ${corrected} labels corrected, ${policed} changed by policy; every region now has final, block and slot`);
}

// ---------------------------------------------------------------- run
if (APPLY) apply(APPLY);
else if (SCORE) score(SCORE);
else if (SAMPLE) { const list = sample(rows.filter((x) => !x.flagged), Number(SAMPLE), SEED); console.log(`${list.length} of ${rows.filter((x) => !x.flagged).length} unflagged regions, seed ${SEED}`); print(list); }
else { const list = rows.filter((x) => x.flagged); console.log(`${list.length} flagged of ${rows.length} regions`); print(list); }

// The scorecard. NEXT.md B3 and B4. `npm run classify`.
//
//   node tools/classify/run.js                 classify the corpus, score against the labels
//   node tools/classify/run.js --failures 40   also list the biggest confusions with examples
//   node tools/classify/run.js --type comments list every miss for one type
//   node tools/classify/run.js --page <id>     print every region of one page with its call
//   node tools/classify/run.js --stack         directory, then trees (out-of-fold), then rules
//
// Scores tools/classify/heuristic.js against `final` in corpus/pages/*/labels.json.
// Two numbers matter: strict (the call equals the final label) and lenient (the call
// is the final label, or Jev's runner-up where the review said "either"). Per-type
// precision, recall and F1 say which types work. Pages are split by site into dev
// (three quarters) and holdout (one quarter, by a hash of the site) so a rule tuned on
// dev is checked on sites it never saw; the holdout number is the honest one.
//
// Every run is written to corpus/scorecard/<timestamp>.json and latest.json, and diffed
// against the previous latest so a regression shows up as a line, not a feeling.

'use strict';

const fs = require('fs');
const path = require('path');
const { classifyAll, RULES } = require('./heuristic');
const { loadPages, ROOT } = require('./corpus');
const { BLOCK_TYPES } = require('../label/questions');
const { deriveAxes } = require('../label/axes');
const { dispositionOf } = require('../label/disposition');

const OUT_DIR = path.join(ROOT, 'corpus', 'scorecard');

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const FAILURES = Number(flag('--failures') || 0);
const TYPE = flag('--type');
const PAGE = flag('--page');
const has = (n) => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };

const pad = (s, n) => { s = String(s ?? ''); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); };
const pctOf = (a, n) => n ? (100 * a / n).toFixed(1) + '%' : '-';
const STACK = has('--stack');
const BLEND = Number(flag('--blend') || 0.7);

// ---------------------------------------------------------------- load
const pages = loadPages();

// --stack: directory where it covers (derived from the site's other pages), then the
// trees' out-of-fold call where confident (corpus/model/oof.json from train.js --cv),
// then the rules. Every part is judged only on pages it did not learn from.
if (STACK) {
  const { derive, lookup } = require('../sites/derive');
  const oofFile = path.join(ROOT, 'corpus', 'model', 'oof.json');
  const oof = fs.existsSync(oofFile) ? JSON.parse(fs.readFileSync(oofFile, 'utf8')) : null;
  if (!oof) console.log('no corpus/model/oof.json: run `node tools/classify/train.js --cv 4` first; scoring directory then rules only');
  const calls = classifyAll(pages);
  const bySite = {};
  for (const p of pages) (bySite[p.site] = bySite[p.site] || []).push(p);
  const tally = { n: 0, rules: 0, trees: 0, dir: 0, dirCovered: 0, dirRight: 0, stack: 0, stackNoDir: 0 };
  for (const p of pages) {
    const others = bySite[p.site].filter((q) => q !== p);
    const blocks = others.length ? derive(others) : [];
    for (const a of p.labels) {
      const id = `${p.id}:${a.index}`;
      const rule = calls.get(id).type;
      const o = oof && oof.calls[id];
      const tree = o && o.conf >= BLEND ? o.type : null;
      const dir = blocks.length ? lookup(blocks, p.regions[a.index]) : null;
      tally.n++;
      if (rule === a.final) tally.rules++;
      if ((o ? o.type : rule) === a.final) tally.trees++;
      if (dir) { tally.dirCovered++; if (dir === a.final) tally.dirRight++; }
      if ((tree || rule) === a.final) tally.stackNoDir++;
      if ((dir || tree || rule) === a.final) tally.stack++;
    }
  }
  const pct = (x) => (100 * x / tally.n).toFixed(1) + '%';
  console.log(`STACK  ${pages.length} pages, ${Object.keys(bySite).length} sites, ${tally.n} regions${oof ? `, trees from ${oof.folds}-fold out-of-fold calls at confidence ${BLEND}` : ''}`);
  console.log(`  rules alone            ${pct(tally.rules)}`);
  if (oof) console.log(`  trees alone            ${pct(tally.trees)}`);
  if (oof) console.log(`  trees then rules       ${pct(tally.stackNoDir)}`);
  console.log(`  directory              covers ${pct(tally.dirCovered)}, right where covered ${(100 * tally.dirRight / Math.max(tally.dirCovered, 1)).toFixed(1)}%`);
  console.log(`  directory, trees, rules  ${pct(tally.stack)}`);

  // Keep / demote / drop: the decision that has to be right. Scored for the rules, the
  // stack, and a conservative stack that only drops on a directory hit or a confident
  // tree call and demotes every other drop.
  const dispo = { rules: newDispo(), stack: newDispo(), conservative: newDispo() };
  for (const p of pages) {
    const others = bySite[p.site].filter((q) => q !== p);
    const blocks = others.length ? derive(others) : [];
    for (const a of p.labels) {
      const id = `${p.id}:${a.index}`;
      const truth = dispositionOf(a.final);
      const rule = calls.get(id).type;
      const o = oof && oof.calls[id];
      const dir = blocks.length ? lookup(blocks, p.regions[a.index]) : null;
      const tree = o && o.conf >= BLEND ? o.type : null;
      const stackCall = dir || tree || rule;
      let cons = dispositionOf(stackCall);
      if (cons === 'drop' && !dir && !(o && o.conf >= 0.8 && o.type === stackCall)) cons = 'demote';
      count(dispo.rules, truth, dispositionOf(rule));
      count(dispo.stack, truth, dispositionOf(stackCall));
      count(dispo.conservative, truth, cons);
    }
  }
  console.log(`\nKEEP / DEMOTE / DROP  (truth by row: keep ${dispo.rules.rows.keep}, demote ${dispo.rules.rows.demote}, drop ${dispo.rules.rows.drop})`);
  console.log(`  ${pad('', 14)} ${pad('agree', 8)} ${pad('content lost', 14)} ${pad('chrome leaked', 14)} ${pad('kept as chrome', 16)}`);
  for (const [name, d] of Object.entries(dispo)) {
    if (name !== 'rules' && !oof) continue;
    console.log(`  ${pad(name, 14)} ${pad(pctOf(d.agree, tally.n), 8)} ${pad(pctOf(d.m.keep.drop, d.rows.keep), 14)} ${pad(pctOf(d.m.drop.keep, d.rows.drop), 14)} ${pad(pctOf(d.m.keep.demote, d.rows.keep), 16)}`);
  }
  console.log(`  content lost = keep regions called drop; chrome leaked = drop regions called keep; kept as chrome = keep regions called demote (visible, just out of the column)`);
  process.exit(0);
}
function newDispo() { const m = {}; for (const a of ['keep', 'demote', 'drop']) { m[a] = { keep: 0, demote: 0, drop: 0 }; } return { m, rows: { keep: 0, demote: 0, drop: 0 }, agree: 0 }; }
function count(d, truth, call) { d.m[truth][call]++; d.rows[truth]++; if (truth === call) d.agree++; }


// ---------------------------------------------------------------- classify and score
const calls = classifyAll(pages);
const rows = [];
for (const p of pages) {
  // The two axes from the calls, derived exactly as the labels' axes were.
  const axes = deriveAxes(p.regions, p.regions.map((_, i) => calls.get(`${p.id}:${i}`).type));
  for (const a of p.labels) {
    const r = p.regions[a.index];
    const call = { ...calls.get(`${p.id}:${a.index}`), ...axes[a.index] };
    const acceptable = new Set([a.final]);
    if (a.review === 'either' && a.top[1]) acceptable.add(a.top[1][0]);
    rows.push({ id: `${p.id}:${a.index}`, page: p.id, site: p.site, split: p.split, r, a, call, strict: call.type === a.final, lenient: acceptable.has(call.type), blockOk: call.block === a.block, slotOk: call.slot === a.slot, axesOk: call.block === a.block && call.slot === a.slot });
  }
}

function score(list) {
  const n = list.length;
  const strict = list.filter((x) => x.strict).length;
  const lenient = list.filter((x) => x.lenient).length;
  const perType = {};
  for (const t of Object.keys(BLOCK_TYPES)) perType[t] = { tp: 0, fp: 0, fn: 0, n: 0 };
  for (const x of list) {
    const g = x.a.final, c = x.call.type;
    perType[g] = perType[g] || { tp: 0, fp: 0, fn: 0, n: 0 };
    perType[c] = perType[c] || { tp: 0, fp: 0, fn: 0, n: 0 };
    perType[g].n++;
    if (x.strict) perType[g].tp++;
    else { perType[g].fn++; perType[c].fp++; }
  }
  const types = {};
  for (const [t, s] of Object.entries(perType)) {
    if (!s.n && !s.fp) continue;
    const p = s.tp + s.fp ? s.tp / (s.tp + s.fp) : 0;
    const rc = s.n ? s.tp / s.n : 0;
    types[t] = { n: s.n, called: s.tp + s.fp, precision: +p.toFixed(3), recall: +rc.toFixed(3), f1: +(p + rc ? 2 * p * rc / (p + rc) : 0).toFixed(3) };
  }
  // Macro F1 over types that occur at least 5 times, so rare types do not swing it.
  const common = Object.values(types).filter((t) => t.n >= 5);
  const macroF1 = common.length ? +(common.reduce((s, t) => s + t.f1, 0) / common.length).toFixed(3) : 0;
  const blockOk = list.filter((x) => x.blockOk).length, slotOk = list.filter((x) => x.slotOk).length, axesOk = list.filter((x) => x.axesOk).length;
  const slots = {};
  for (const x of list) { const s = slots[x.a.slot] = slots[x.a.slot] || { n: 0, ok: 0 }; s.n++; if (x.slotOk) s.ok++; }
  return { regions: n, strict: +(strict / n).toFixed(3), lenient: +(lenient / n).toFixed(3), macroF1, block: +(blockOk / n).toFixed(3), slot: +(slotOk / n).toFixed(3), axes: +(axesOk / n).toFixed(3), types, slots };
}

const all = score(rows);
const dev = score(rows.filter((x) => x.split === 'dev'));
const hold = score(rows.filter((x) => x.split === 'holdout'));
const perPage = {};
for (const p of pages) {
  const list = rows.filter((x) => x.page === p.id);
  perPage[p.id] = { split: p.split, regions: list.length, strict: list.length ? +(list.filter((x) => x.strict).length / list.length).toFixed(2) : null };
}
const confusions = {};
for (const x of rows) if (!x.lenient) { const k = `${x.a.final} -> ${x.call.type}`; confusions[k] = confusions[k] || { n: 0, rules: {} }; confusions[k].n++; confusions[k].rules[x.call.rule] = (confusions[k].rules[x.call.rule] || 0) + 1; }
const ruleUse = {};
for (const x of rows) { ruleUse[x.call.rule] = ruleUse[x.call.rule] || { n: 0, right: 0 }; ruleUse[x.call.rule].n++; if (x.lenient) ruleUse[x.call.rule].right++; }

const card = {
  at: new Date().toISOString(),
  pages: pages.length, sites: new Set(pages.map((p) => p.site)).size, rules: RULES.length,
  all, dev, holdout: hold,
  perPage,
  confusions: Object.fromEntries(Object.entries(confusions).sort((a, b) => b[1].n - a[1].n).slice(0, 60)),
  ruleUse: Object.fromEntries(Object.entries(ruleUse).sort((a, b) => b[1].n - a[1].n)),
};

// ---------------------------------------------------------------- diff and write
fs.mkdirSync(OUT_DIR, { recursive: true });
const latestFile = path.join(OUT_DIR, 'latest.json');
const previous = fs.existsSync(latestFile) ? JSON.parse(fs.readFileSync(latestFile, 'utf8')) : null;
if (!PAGE && !TYPE) {
  fs.writeFileSync(path.join(OUT_DIR, card.at.replace(/[:.]/g, '-') + '.json'), JSON.stringify(card, null, 1));
  fs.writeFileSync(latestFile, JSON.stringify(card, null, 1));
}

// ---------------------------------------------------------------- print
const pct = (x) => (100 * x).toFixed(1) + '%';
const delta = (a, b) => b == null ? '' : ` (${a - b >= 0 ? '+' : ''}${(100 * (a - b)).toFixed(1)})`;

if (PAGE) {
  const p = pages.find((x) => x.id === PAGE);
  if (!p) { console.error(`no page ${PAGE}`); process.exit(1); }
  console.log(`${p.id}  ${p.url}\n`);
  for (const x of rows.filter((x) => x.page === PAGE)) {
    console.log(`${pad(x.a.index, 4)} ${x.strict ? '  ' : x.lenient ? '~ ' : 'X '}${pad(x.a.final, 16)} ${pad(x.call.type, 16)} ${pad(x.call.rule, 20)} ${pad(x.r.tag, 9)} ${x.r.text.slice(0, 70).replace(/\n/g, ' | ')}`);
  }
  process.exit(0);
}
if (TYPE) {
  const miss = rows.filter((x) => (x.a.final === TYPE || x.call.type === TYPE) && !x.lenient);
  console.log(`${TYPE}: ${rows.filter((x) => x.a.final === TYPE).length} labelled, ${rows.filter((x) => x.call.type === TYPE).length} called, ${miss.length} misses\n`);
  for (const x of miss) console.log(`${pad(x.id, 24)} ${pad(x.a.final, 16)} ${pad(x.call.type, 16)} ${pad(x.call.rule, 20)} ${pad(x.r.tag, 9)} ${x.r.text.slice(0, 80).replace(/\n/g, ' | ')}`);
  process.exit(0);
}

console.log(`SCORECARD  ${card.at.slice(0, 16)}  ${pages.length} pages, ${card.sites} sites, ${rows.length} regions, ${RULES.length} rules`);
console.log(`           strict          lenient         macro-F1        block           slot            block+slot`);
const line = (name, s, prev) => console.log(`${pad(name, 10)} ${pad(pct(s.strict) + delta(s.strict, prev && prev.strict), 16)}${pad(pct(s.lenient) + delta(s.lenient, prev && prev.lenient), 16)}${pad(s.macroF1 + (prev ? delta(s.macroF1, prev.macroF1) : ''), 16)}${pad(pct(s.block) + delta(s.block, prev && prev.block), 16)}${pad(pct(s.slot) + delta(s.slot, prev && prev.slot), 16)}${pct(s.axes)}${delta(s.axes, prev && prev.axes)}`);
line('all', all, previous && previous.all);
line('dev', dev, previous && previous.dev);
line('holdout', hold, previous && previous.holdout);
console.log(`\nper slot (all): slot n accuracy`);
for (const [sl, s] of Object.entries(all.slots).sort((a, b) => b[1].n - a[1].n)) console.log(`  ${pad(sl, 14)} ${pad(s.n, 5)} ${pct(s.ok / s.n)}`);
console.log(`\nper type (all), n>=5, sorted by n:  type n called P R F1`);
for (const [t, s] of Object.entries(all.types).filter(([, s]) => s.n >= 5).sort((a, b) => b[1].n - a[1].n)) {
  const prev = previous && previous.all.types[t];
  console.log(`  ${pad(t, 18)} ${pad(s.n, 5)} ${pad(s.called, 6)} ${pad(s.precision.toFixed(2), 5)} ${pad(s.recall.toFixed(2), 5)} ${s.f1.toFixed(2)}${prev ? delta(s.f1, prev.f1) : ''}`);
}
const rare = Object.entries(all.types).filter(([, s]) => s.n > 0 && s.n < 5);
console.log(`\nrare types (n<5): ${rare.map(([t, s]) => `${t} ${s.tp || Math.round(s.recall * s.n)}/${s.n}`).join('  ')}`);
console.log(`\ntop confusions (final -> call, not lenient), with the rule that made the call:`);
for (const [k, c] of Object.entries(card.confusions).slice(0, FAILURES || 25)) {
  console.log(`  ${pad(k, 38)} ${pad(c.n, 4)} ${Object.entries(c.rules).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r, n]) => `${r} ${n}`).join(', ')}`);
}
if (FAILURES) {
  console.log(`\nexamples of the top ${Math.min(FAILURES, 12)} confusions:`);
  for (const k of Object.keys(card.confusions).slice(0, Math.min(FAILURES, 12))) {
    const [g, c] = k.split(' -> ');
    console.log(`\n  ${k}`);
    for (const x of rows.filter((x) => x.a.final === g && x.call.type === c && !x.lenient).slice(0, 4)) console.log(`    ${pad(x.id, 24)} ${pad(x.call.rule, 18)} ${pad(x.r.tag, 8)} ${x.r.text.slice(0, 80).replace(/\n/g, ' | ')}`);
  }
}
console.log(`\nworst pages (strict):  ${Object.entries(perPage).sort((a, b) => a[1].strict - b[1].strict).slice(0, 8).map(([id, p]) => `${id} ${pct(p.strict)}`).join('  ')}`);
console.log(`least reliable rules (n>=10):  ${Object.entries(ruleUse).filter(([, r]) => r.n >= 10).sort((a, b) => a[1].right / a[1].n - b[1].right / b[1].n).slice(0, 8).map(([r, u]) => `${r} ${u.right}/${u.n}`).join('  ')}`);
if (previous) {
  const regress = Object.entries(all.types).filter(([t, s]) => s.n >= 5 && previous.all.types[t] && s.f1 < previous.all.types[t].f1 - 0.05).map(([t, s]) => `${t} ${previous.all.types[t].f1.toFixed(2)}->${s.f1.toFixed(2)}`);
  if (regress.length) console.log(`\nREGRESSIONS vs previous run: ${regress.join('  ')}`);
}
console.log(`\nwritten corpus/scorecard/latest.json`);

// Train the trees on the labelled corpus and say whether they beat the rules. NEXT.md B5.
//
//   node tools/classify/train.js              train on dev sites, score holdout, save model
//   node tools/classify/train.js --cv 4       4-fold cross-validation by site instead; also writes
//                                            corpus/model/oof.json, every region's out-of-fold call,
//                                            which run.js --stack scores honestly
//   node tools/classify/train.js --rounds 80 --depth 5 --lr 0.1   hyperparameters
//   node tools/classify/train.js --final      train on every site and save (after --cv says it is worth it)
//
// Scores three things on the held-out sites, strict against `final`:
//   rules     heuristic.js alone
//   trees     the model alone
//   blend     the model where its top probability clears a threshold, else the rules
// and prints the blend for several thresholds, so the choice of threshold is visible.
//
// The model is saved to corpus/model/gbt.json with the feature names, the type list,
// the options and the holdout scores, so a later run can tell what it is looking at.

'use strict';

const fs = require('fs');
const path = require('path');
const { loadPages, fold, ROOT } = require('./corpus');
const { vectorizeAll, NAMES, TYPES } = require('./vectors');
const gbt = require('./gbt');

const argv = process.argv.slice(2);
const flag = (n, dflt) => { const i = argv.indexOf(n); if (i < 0) return dflt; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const has = (n) => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };
const CV = Number(flag('--cv', 0));
const FINAL = has('--final');
const OPTS = { rounds: Number(flag('--rounds', 60)), depth: Number(flag('--depth', 4)), learningRate: Number(flag('--lr', 0.15)), minLeaf: Number(flag('--min-leaf', 4)), lambda: Number(flag('--lambda', 1)), colSample: Number(flag('--col', 0.5)) };
const THRESHOLDS = [0, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const MODEL_FILE = path.join(ROOT, 'corpus', 'model', 'gbt.json');
const OOF_FILE = path.join(ROOT, 'corpus', 'model', 'oof.json');

const pages = loadPages();
const rows = [];
const vecs = vectorizeAll(pages);
const byId = new Map(vecs.map((v) => [v.id, v]));
for (const p of pages) for (const a of p.labels) { const v = byId.get(`${p.id}:${a.index}`); rows.push({ ...v, final: a.final, split: p.split, y: TYPES.indexOf(a.final) }); }
const K = TYPES.length;
const d = NAMES.length;
console.log(`${rows.length} regions, ${d} features, ${K} types, ${pages.length} pages\n`);

function matrix(list) {
  const X = new Float32Array(list.length * d);
  const y = new Int32Array(list.length);
  list.forEach((r, i) => { X.set(r.v, i * d); y[i] = r.y; });
  return { X, y };
}

const oof = {};
function evaluate(model, list) {
  const out = { rules: 0, trees: 0, blend: Object.fromEntries(THRESHOLDS.map((t) => [t, 0])), n: list.length, perType: {} };
  for (const r of list) {
    const p = gbt.predictProba(model, r.v);
    let bk = 0;
    for (let k = 1; k < K; k++) if (p[k] > p[bk]) bk = k;
    const tree = TYPES[bk], conf = p[bk];
    oof[r.id] = { type: tree, conf: +conf.toFixed(3) };
    if (r.call.type === r.final) out.rules++;
    if (tree === r.final) out.trees++;
    for (const t of THRESHOLDS) if ((conf >= t ? tree : r.call.type) === r.final) out.blend[t]++;
    const pt = out.perType[r.final] = out.perType[r.final] || { n: 0, rules: 0, trees: 0 };
    pt.n++; if (r.call.type === r.final) pt.rules++; if (tree === r.final) pt.trees++;
  }
  return out;
}

const pct = (a, n) => (100 * a / n).toFixed(1) + '%';
function report(name, e) {
  console.log(`${name}: ${e.n} regions   rules ${pct(e.rules, e.n)}   trees ${pct(e.trees, e.n)}   blend ${THRESHOLDS.map((t) => `@${t} ${pct(e.blend[t], e.n)}`).join('  ')}`);
}

function trainOn(list, log) {
  const { X, y } = matrix(list);
  return gbt.train(X, y, K, OPTS, log);
}

if (CV) {
  const totals = { rules: 0, trees: 0, blend: Object.fromEntries(THRESHOLDS.map((t) => [t, 0])), n: 0 };
  for (let f = 0; f < CV; f++) {
    const test = rows.filter((r) => fold(r.site, CV) === f);
    const train = rows.filter((r) => fold(r.site, CV) !== f);
    if (!test.length) continue;
    const model = trainOn(train, () => {});
    const e = evaluate(model, test);
    report(`fold ${f} (${new Set(test.map((r) => r.site)).size} sites)`, e);
    totals.n += e.n; totals.rules += e.rules; totals.trees += e.trees;
    for (const t of THRESHOLDS) totals.blend[t] += e.blend[t];
  }
  report(`\n${CV}-fold total`, totals);
  fs.mkdirSync(path.dirname(OOF_FILE), { recursive: true });
  fs.writeFileSync(OOF_FILE, JSON.stringify({ at: new Date().toISOString(), folds: CV, opts: OPTS, calls: oof }));
  console.log(`written corpus/model/oof.json (${Object.keys(oof).length} out-of-fold calls)`);
} else {
  const train = rows.filter((r) => r.split === (FINAL ? r.split : 'dev'));
  const test = rows.filter((r) => r.split === 'holdout');
  const model = trainOn(train, (m) => console.log('  ' + m));
  const e = evaluate(model, test);
  console.log();
  report(FINAL ? 'holdout (seen in training; not a test)' : 'holdout', e);
  console.log('\nper type on holdout (n rules trees), n>=5:');
  for (const [t, c] of Object.entries(e.perType).filter(([, c]) => c.n >= 5).sort((a, b) => b[1].n - a[1].n)) console.log(`  ${t.padEnd(18)} ${String(c.n).padStart(4)} ${pct(c.rules, c.n).padStart(7)} ${pct(c.trees, c.n).padStart(7)}`);
  fs.mkdirSync(path.dirname(MODEL_FILE), { recursive: true });
  fs.writeFileSync(MODEL_FILE, JSON.stringify(gbt.toJSON(model, { trainedAt: new Date().toISOString(), trainedOn: FINAL ? 'all' : 'dev', features: NAMES, types: TYPES, holdout: { n: e.n, rules: e.rules, trees: e.trees, blend: e.blend } })));
  console.log(`\nwritten corpus/model/gbt.json (${Math.round(fs.statSync(MODEL_FILE).size / 1024)} KB)`);
}

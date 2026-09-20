'use strict';
// The design filter's classifier, at runtime. Runs in the page preload (Node available,
// no DOM assumptions beyond what the extractor already made). Same code the scorecard
// runs offline, so what the browser does to a page is what `npm run classify` measured:
//
//   directory  the site's entry (directory/<host>.json), where a selector matches
//   trees      the trained model (corpus/model/gbt.json), where it is confident
//   rules      tools/classify/heuristic.js, always
//
// then the two axes (block, slot) and the disposition (keep, demote, drop). The drop
// decision is conservative: a rule alone never drops, only a directory hit or a
// confident tree call does; everything else it would drop is demoted instead. The
// scorecard puts content lost at 0.1% under this policy.
//
// tools/classify and tools/label are product code from here on, not just tooling;
// they stay where the scorecard finds them.

const { features, siteIndex } = require('../../tools/classify/features');
const { classify } = require('../../tools/classify/heuristic');
const { vectorize, TYPES } = require('../../tools/classify/vectors');
const gbt = require('../../tools/classify/gbt');
const { deriveAxes } = require('../../tools/label/axes');
const { dispositionOf } = require('../../tools/label/disposition');
const { selectorOf } = require('../../tools/sites/derive');

const TREE_BLEND = 0.5;   // trees override the rules above this confidence
const TREE_DROP = 0.8;    // and may drop above this one

// regions: extractor output. site: host. directory: [{selector, type}] or null.
// model: parsed gbt.json or null. Returns { calls, counts }.
function classifyPage(regions, { url, site, directory, model }) {
  const page = { id: 'live', site, url, regions, viewport: { width: 1 }, pageHeight: 1 };
  const index = siteIndex([page]);
  const dirMap = directory && directory.length ? new Map(directory.map((b) => [b.selector, b.type])) : null;
  const types = [];
  const calls = regions.map((r, i) => {
    const f = features(page, i, index);
    const rule = classify(f);
    let type = rule.type, source = 'rules', confidence = null;
    let tree = null;
    if (model) {
      const { v } = vectorize(page, i, index);
      const p = gbt.predictProba(model, v);
      let bk = 0;
      for (let k = 1; k < p.length; k++) if (p[k] > p[bk]) bk = k;
      tree = { type: TYPES[bk], conf: p[bk] };
      if (tree.conf >= TREE_BLEND) { type = tree.type; source = 'trees'; confidence = +tree.conf.toFixed(2); }
    }
    const dir = dirMap ? dirMap.get(selectorOf(r)) : null;
    if (dir) { type = dir; source = 'directory'; confidence = null; }
    types.push(type);
    return { index: i, type, source, confidence, rule: rule.rule, ruleType: rule.type, tree: tree ? { type: tree.type, conf: +tree.conf.toFixed(2) } : null };
  });
  const axes = deriveAxes(regions, types);
  const counts = { total: regions.length, keep: 0, demote: 0, drop: 0, bySource: { directory: 0, trees: 0, rules: 0 } };
  calls.forEach((c, i) => {
    c.block = axes[i].block;
    c.slot = axes[i].slot;
    let d = dispositionOf(c.type);
    if (d === 'drop' && !(c.source === 'directory' || c.source === 'trees' && c.confidence >= TREE_DROP)) { d = 'demote'; c.softened = true; }
    c.disposition = d;
    counts[d]++;
    counts.bySource[c.source]++;
  });
  return { calls, counts };
}

module.exports = { classifyPage, TREE_BLEND, TREE_DROP };

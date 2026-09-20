// Turn a region into a numeric vector for the trained classifier. NEXT.md B5.
//
// Everything the heuristic sees, flattened: the numeric features, every HINT and TEXT
// hit as a 0/1, the tag, the innermost landmark, the rule that fired in heuristic.js and
// the type it gave. The last two make this a stacked model: the trees learn when to
// trust a rule and when a rule is the wrong one. Names are stable so a saved model can
// be applied later to a vector built the same way.

'use strict';

const { features, siteIndex, HINTS, TEXT } = require('./features');
const { classify, RULES } = require('./heuristic');
const { BLOCK_TYPES } = require('../label/questions');

const TAGS = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'span', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'main', 'table', 'tbody', 'tr', 'td', 'pre', 'code', 'blockquote', 'figure', 'img', 'picture', 'svg', 'video', 'audio', 'canvas', 'iframe', 'form', 'input', 'button', 'select', 'textarea', 'label', 'dl', 'hr', 'font', 'center', 'strong', 'b', 'em', 'small', 'time', 'summary', 'details', 'dialog'];
const LANDMARKS = ['', 'header', 'nav', 'main', 'article', 'section', 'aside', 'footer', 'form', 'dialog', 'role=banner', 'role=navigation', 'role=main', 'role=contentinfo', 'role=complementary', 'role=search', 'role=form', 'role=dialog', 'role=region'];
const TYPES = Object.keys(BLOCK_TYPES);
const RULE_NAMES = RULES.map(([name]) => name);

const NUMERIC = ['len', 'ltr', 'links', 'images', 'headings', 'items', 'rows', 'controls', 'paragraphs', 'repeats', 'words', 'commas', 'sentences', 'avgLine', 'capsWords', 'top', 'height', 'pos', 'index', 'repeatPages', 'repeatFrac', 'pagesOfSite'];
const BOOLS = ['run', 'bigImage', 'iconsOnly', 'inHeader', 'inFooter', 'inNav', 'inMain', 'inAside', 'inForm', 'inDialog', 'inSearch', 'aboveFold', 'wide', 'narrow', 'first', 'lastRegion', 'repeated', 'short', 'tiny', 'prose', 'linky', 'actionWord', 'firstProse', 'prevTitleish'];

function names() {
  const out = [];
  for (const k of NUMERIC) out.push(`n:${k}`);
  out.push('n:lines', 'n:widthFraction', 'n:leftFraction', 'n:frameW', 'n:frameH', 'n:imgMax', 'n:imgCount', 'n:lenPerRepeat', 'n:textDensity', 'n:linksPerLine', 'n:log1pLen', 'n:prevLen', 'n:nextLen', 'n:prevLinks', 'n:nextLinks');
  for (const k of BOOLS) out.push(`b:${k}`);
  out.push('b:frame', 'b:hasImages', 'b:prevHeading', 'b:nextHeading', 'b:sameTagAsPrev', 'b:sameTagAsNext');
  for (const k of Object.keys(HINTS)) out.push(`h:${k}`);
  for (const k of Object.keys(TEXT)) out.push(`t:${k}`);
  for (const t of TAGS) out.push(`tag:${t}`);
  out.push('tag:other');
  for (const l of LANDMARKS) out.push(`lm:${l || 'none'}`);
  for (const r of RULE_NAMES) out.push(`rule:${r}`);
  for (const t of TYPES) out.push(`heur:${t}`);
  return out;
}

const NAMES = names();
const INDEX = new Map(NAMES.map((n, i) => [n, i]));
const set = (v, name, value) => { const i = INDEX.get(name); if (i !== undefined) v[i] = value; };

function vectorize(page, i, index) {
  const f = features(page, i, index);
  const call = classify(f);
  const v = new Float32Array(NAMES.length);
  for (const k of NUMERIC) set(v, `n:${k}`, Number(f[k]) || 0);
  set(v, 'n:lines', f.lines.length);
  set(v, 'n:widthFraction', f.g.widthFraction);
  set(v, 'n:leftFraction', f.g.leftFraction);
  set(v, 'n:frameW', f.frame ? f.frame.width : 0);
  set(v, 'n:frameH', f.frame ? f.frame.height : 0);
  set(v, 'n:imgMax', f.imgs.length ? Math.max(...f.imgs.map((im) => im.width * im.height)) : 0);
  set(v, 'n:imgCount', f.imgs.length);
  set(v, 'n:lenPerRepeat', f.len / Math.max(f.repeats, 1));
  set(v, 'n:textDensity', f.len / Math.max(f.height, 1));
  set(v, 'n:linksPerLine', f.links / Math.max(f.lines.length, 1));
  set(v, 'n:log1pLen', Math.log1p(f.len));
  set(v, 'n:prevLen', f.prev ? f.prev.textLength : -1);
  set(v, 'n:nextLen', f.next ? f.next.textLength : -1);
  set(v, 'n:prevLinks', f.prev ? f.prev.counts.links : -1);
  set(v, 'n:nextLinks', f.next ? f.next.counts.links : -1);
  for (const k of BOOLS) set(v, `b:${k}`, f[k] ? 1 : 0);
  set(v, 'b:frame', f.frame ? 1 : 0);
  set(v, 'b:hasImages', f.imgs.length ? 1 : 0);
  set(v, 'b:prevHeading', f.prev && /^h[1-6]/.test(f.prev.tag) ? 1 : 0);
  set(v, 'b:nextHeading', f.next && /^h[1-6]/.test(f.next.tag) ? 1 : 0);
  set(v, 'b:sameTagAsPrev', f.prev && f.prev.tag.replace(/×\d+$/, '') === f.tag ? 1 : 0);
  set(v, 'b:sameTagAsNext', f.next && f.next.tag.replace(/×\d+$/, '') === f.tag ? 1 : 0);
  for (const k of Object.keys(HINTS)) set(v, `h:${k}`, f.h(k) ? 1 : 0);
  for (const k of Object.keys(TEXT)) set(v, `t:${k}`, f.tx(k) ? 1 : 0);
  set(v, TAGS.includes(f.tag) ? `tag:${f.tag}` : 'tag:other', 1);
  set(v, `lm:${LANDMARKS.includes(f.last) ? f.last || 'none' : 'none'}`, 1);
  set(v, `rule:${call.rule}`, 1);
  set(v, `heur:${call.type}`, 1);
  return { v, call };
}

// Vectors for every region of every page: [{ id, page, site, index, v, call }].
function vectorizeAll(pages) {
  const index = siteIndex(pages);
  const out = [];
  for (const p of pages) for (let i = 0; i < p.regions.length; i++) out.push({ id: `${p.id}:${i}`, page: p.id, site: p.site, index: i, ...vectorize(p, i, index) });
  return out;
}

module.exports = { NAMES, TYPES, vectorize, vectorizeAll };

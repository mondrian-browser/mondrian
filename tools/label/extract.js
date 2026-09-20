// Region extraction, run inside the page through eval_js.
//
// Splits a page into candidate regions and describes each one structurally: what it
// is, what it counts, where it sits, and a sample of its text. That description, not
// the HTML, is what Jev sees. It is also the feature set the heuristic baseline (B3)
// will score on, so the two stay comparable by construction.
//
// The walk: descend from body; unwrap single-child wrappers; stop at content leaves
// (paragraph runs, tables, lists, figures, forms, pre, blockquote, headings) or at any
// element small enough to be one block; otherwise split into visible block children.
// Runs of consecutive siblings with the same tag and class (paragraphs, cards, comment
// rows) are merged into one region, with `counts.repeats` saying how many.
//
// Exported as source text because it has to cross into the page.

'use strict';

const EXTRACT_SOURCE = `(() => {
  const MAX_REGIONS = 40;
  const SMALL_TEXT = 700;     // chars; a region with less text than this is one block
  const SMALL_HEIGHT = 480;   // px
  const LEAF = new Set(['P','TABLE','UL','OL','DL','PRE','BLOCKQUOTE','FIGURE','IMG','VIDEO','AUDIO','PICTURE','CANVAS','SVG','IFRAME','FORM','H1','H2','H3','H4','H5','H6','HR','TEXTAREA','SELECT','BUTTON','INPUT']);
  const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','LINK','META','HEAD']);
  const LANDMARK = new Set(['HEADER','NAV','MAIN','ARTICLE','SECTION','ASIDE','FOOTER','FORM','DIALOG']);
  const vw = innerWidth, vh = innerHeight;
  const pageH = Math.max(document.documentElement.scrollHeight, 1);

  function visible(el) {
    if (SKIP.has(el.tagName)) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    if (cs.display === 'contents') return el.children.length > 0; // no box of its own; children decide
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  }
  function blockKids(el) {
    const out = [];
    for (const k of el.children) if (visible(k)) out.push(k);
    return out;
  }
  function text(el) {
    // innerText stops at shadow boundaries; walk them by hand.
    let s = '';
    const walk = (n) => {
      if (n.nodeType === 3) { s += n.nodeValue; return; }
      if (n.nodeType !== 1 || SKIP.has(n.tagName)) return;
      if (n.shadowRoot) for (const c of n.shadowRoot.childNodes) walk(c);
      for (const c of n.childNodes) walk(c);
      if (/^(P|DIV|LI|TR|H[1-6]|BR|SECTION|ARTICLE)$/.test(n.tagName)) s += '\\n';
    };
    walk(el);
    return s.replace(/[ \\t]+/g, ' ').replace(/\\n\\s*\\n+/g, '\\n').trim();
  }

  // Collect leaf regions.
  const leaves = [];
  function walk(el, depth, top) {
    if (leaves.length >= MAX_REGIONS * 3) return;
    if (!visible(el)) return;
    top = top || el;
    // A table that contains tables is layout, not data (Hacker News); descend into it.
    const layoutTable = el.tagName === 'TABLE' && !!el.querySelector('table');
    if (LEAF.has(el.tagName) && !layoutTable) { leaves.push({ el, top }); return; }
    const kids = blockKids(el);
    if (kids.length === 0) { leaves.push({ el, top }); return; }
    if (kids.length === 1 && !LANDMARK.has(el.tagName)) { walk(kids[0], depth + 1, top); return; }
    const r = el.getBoundingClientRect();
    const t = text(el);
    if (depth > 0 && t.length < SMALL_TEXT && r.height < SMALL_HEIGHT) { leaves.push({ el, top }); return; }
    if (depth > 14) { leaves.push({ el, top }); return; }
    for (const k of kids) walk(k, depth + 1, null);
  }
  walk(document.body, 0, null);

  // Merge runs of consecutive siblings with the same tag and class into one region:
  // paragraphs of an article, cards in a carousel, rows of a comment thread. Within-page
  // repetition is the unit the reader sees, and a lone card is a mixture no type fits.
  const sig = (el) => el.tagName + '.' + ((typeof el.className === 'string' ? el.className : '').trim().split(/\\s+/).slice(0, 2).join('.'));
  const merged = [];
  for (const { el, top } of leaves) {
    const prev = merged[merged.length - 1];
    if (prev && sig(el) === prev.sig && top.previousElementSibling === prev.tops[prev.tops.length - 1]) { prev.els.push(el); prev.tops.push(top); }
    else merged.push({ sig: sig(el), els: [el], tops: [top] });
  }
  for (const m of merged) m.run = m.els.length > 1;

  function landmarks(el) {
    const out = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const role = n.getAttribute && n.getAttribute('role');
      if (LANDMARK.has(n.tagName)) out.push(n.tagName.toLowerCase());
      else if (role && /^(navigation|main|banner|contentinfo|complementary|search|form|dialog|region)$/.test(role)) out.push('role=' + role);
    }
    return out.reverse();
  }
  function describe(m, index) {
    const els = m.els;
    const first = els[0], last = els[els.length - 1];
    const r0 = first.getBoundingClientRect(), r1 = last.getBoundingClientRect();
    const top = Math.min(r0.top, r1.top) + scrollY;
    const bottom = Math.max(r0.bottom, r1.bottom) + scrollY;
    const t = els.map(text).join('\\n');
    const q = (sel) => els.reduce((n, e) => n + e.querySelectorAll(sel).length, 0);
    const links = els.flatMap((e) => [...e.querySelectorAll('a[href]')]);
    const linkText = links.reduce((n, a) => n + (a.textContent || '').trim().length, 0);
    const own = (name) => (first.getAttribute(name) || '').slice(0, 80);
    const cls = (first.className && typeof first.className === 'string') ? first.className.trim().split(/\\s+/).slice(0, 4).join(' ') : '';
    return {
      index,
      tag: m.run ? first.tagName.toLowerCase() + '×' + els.length : first.tagName.toLowerCase(),
      id: own('id') || undefined,
      class: cls || undefined,
      role: own('role') || undefined,
      ariaLabel: own('aria-label') || undefined,
      landmarks: landmarks(first),
      textLength: t.length,
      text: t.slice(0, 400),
      counts: {
        links: links.length,
        images: q('img,picture,svg,video'),
        headings: q('h1,h2,h3,h4,h5,h6') + (/^H[1-6]$/.test(first.tagName) ? 1 : 0),
        listItems: q('li'),
        tableRows: q('tr'),
        controls: q('input,textarea,select,button'),
        paragraphs: els.filter((e) => e.tagName === 'P').length + q('p'),
        repeats: els.length,
      },
      linkTextRatio: t.length ? +(linkText / t.length).toFixed(2) : 0,
      geometry: {
        top: Math.round(top),
        height: Math.round(bottom - top),
        widthFraction: +(Math.min(r0.width, vw) / vw).toFixed(2),
        leftFraction: +(r0.left / vw).toFixed(2),
        pageFraction: +(top / pageH).toFixed(2),
        aboveFold: top < vh,
      },
    };
  }

  let regions = merged.map(describe);
  // Drop empty decorative bits, then cap by keeping the largest by text and area.
  regions = regions.filter((r) => r.textLength > 0 || r.counts.images > 0 || r.counts.controls > 0);
  if (regions.length > MAX_REGIONS) {
    const score = (r) => r.textLength + r.geometry.height * 0.5 + r.counts.images * 200 + r.counts.controls * 100;
    const keep = new Set([...regions].sort((a, b) => score(b) - score(a)).slice(0, MAX_REGIONS));
    regions = regions.filter((r) => keep.has(r));
  }
  regions.forEach((r, i) => { r.index = i; });

  return {
    url: location.href,
    title: document.title,
    viewport: { width: vw, height: vh },
    pageHeight: pageH,
    regions,
  };
})()`;

module.exports = { EXTRACT_SOURCE };

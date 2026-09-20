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
// Lessons from the accuracy check of 20 Sep 2026 (NEXT.md B2) are encoded here:
//   - a tiny child split off a larger sibling (a date under a review) is not a region,
//     it rejoins the sibling it belongs to; headings, link rows and the page title are
//     never tiny;
//   - a small element that holds the page's H1 (or the document title) and other things
//     beside it (rating, byline, tabs) is a header zone, not one block, and is split
//     one level further;
//   - a table with no header cells and rows of unequal shape is layout, not data;
//   - a parent whose children are mostly one signature is a list, and each row is one
//     block whatever its length, so a long comment is not split where a short one is not;
//   - unwrapping a single-child wrapper does not count as depth (GitHub's React shell
//     is a dozen wrappers deep before any content);
//   - images carry alt text and rendered size, and spacers under 8px do not count.
// There is no region cap: the corpus wants every region.
//
// Exported as source text because it has to cross into the page.

'use strict';

const EXTRACT_SOURCE = `(() => {
  const MAX_LEAVES = 1500;    // safety only; a page that produces more is pathological
  const SMALL_TEXT = 700;     // chars; a region with less text than this is one block
  const SMALL_HEIGHT = 480;   // px
  const TINY_TEXT = 60;       // chars; below this a split-off child rejoins a sibling
  const TINY_HEIGHT = 64;     // px
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
    if (r.width > 4 && r.height > 4) return true;
    // A zero-size element whose children have size is a positioning shell (YouTube's
    // body is 0px tall; everything in it is absolutely positioned). The children decide.
    for (const k of el.children) if (visible(k)) return true;
    return false;
  }
  // Text that sits directly in an element, not in a child element. An element with a
  // lot of it is a text block whatever else it contains (old pages: <font>text<br>text
  // <a>link</a></font>), and splitting it into its element children would drop the text.
  function directText(el) {
    let n = 0;
    for (const c of el.childNodes) if (c.nodeType === 3) n += c.nodeValue.trim().length;
    return n;
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

  // A table is data if it declares headers or its rows share a shape. Otherwise it is
  // layout (Hacker News, old forums, email-style pages) and the walk goes through it.
  function dataTable(t) {
    if (t.querySelector('table')) return false;
    if (t.tHead || t.querySelector('th')) return true;
    const rows = [...t.rows].filter((r) => r.cells.length > 0);
    if (rows.length < 3) return false;
    const width = rows[0].cells.length;
    return width >= 2 && rows.every((r) => r.cells.length === width);
  }
  // Small enough to be one block, unless it is a header zone: the page's H1 with other
  // things beside it. Those other things (rating, byline, tabs, buttons) are each their
  // own block, so the walk goes one level further.
  const titlePrefix = (document.title || '').split(/ [|–—·-] /)[0].trim().slice(0, 40);
  function headerZone(el, kids) {
    if (kids.length < 2) return false;
    if (el.querySelector('h1')) return true;
    return titlePrefix.length >= 12 && text(el).includes(titlePrefix);
  }
  // Signature for "same kind of sibling": tag plus the first two classes.
  const sig = (el) => el.tagName + '.' + ((typeof el.className === 'string' ? el.className : '').trim().split(/\\s+/).slice(0, 2).join('.'));

  // Collect leaf regions. Each leaf is a group of one or more elements (a tiny child
  // that rejoined a sibling makes a group of two) plus the top-level element under the
  // split parent that the group hangs from.
  const leaves = [];
  function leaf(els, top) { leaves.push({ els, top }); }
  function tiny(el) {
    const r = el.getBoundingClientRect();
    if (r.height >= TINY_HEIGHT) return false;
    if (/^H[1-6]$/.test(el.tagName) || el.querySelector('h1,h2,h3,input,textarea,select,button,table,ul,ol')) return false;
    if (el.querySelectorAll('a[href]').length > 1) return false; // a row of links is a block of its own
    const t = text(el);
    if (titlePrefix.length >= 12 && t.includes(titlePrefix)) return false; // the page title is never a fragment
    return t.length < TINY_TEXT;
  }
  function walk(el, depth, top) {
    if (leaves.length >= MAX_LEAVES) return;
    if (!visible(el)) return;
    top = top || el;
    if (el.tagName === 'TABLE' ? dataTable(el) : LEAF.has(el.tagName)) { leaf([el], top); return; }
    const kids = blockKids(el);
    if (kids.length === 0) { leaf([el], top); return; }
    const t = text(el);
    const direct = directText(el);
    if (direct >= 80 || (direct > 0 && direct >= t.length * 0.3)) { leaf([el], top); return; }
    if (kids.length === 1 && !LANDMARK.has(el.tagName)) { walk(kids[0], depth, top); return; } // unwrapping is not depth
    const r = el.getBoundingClientRect();
    if (depth > 0 && t.length < SMALL_TEXT && r.height < SMALL_HEIGHT && !headerZone(el, kids)) { leaf([el], top); return; }
    if (depth > 20) { leaf([el], top); return; }
    // A parent whose children are mostly one signature is a list of rows (comments,
    // cards, results). Each row is one block whatever its length, so a long comment does
    // not get split where a short one would not.
    let rowSig = null;
    if (kids.length >= 3) {
      const tally = {};
      for (const k of kids) tally[sig(k)] = (tally[sig(k)] || 0) + 1;
      const [best, n] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
      // Unclassed divs and spans are not evidence of a list; rows are marked as rows.
      if (n >= kids.length * 0.6 && /[.].|^(LI|TR|ARTICLE|SECTION|DT|DD)\\./.test(best)) {
        // Rows are alike in size as well as in kind: none is huge, none holds a page
        // landmark. Otherwise this is a page skeleton (header row, body row, footer row).
        const rows = kids.filter((k) => sig(k) === best);
        const lens = rows.map((k) => text(k).length).sort((a, b) => a - b);
        const structural = rows.some((k) => k.querySelector('main,article,section,nav,header,footer,aside'));
        const p90 = lens[Math.min(lens.length - 1, Math.floor(lens.length * 0.9))];
        const alike = lens[lens.length - 1] < SMALL_TEXT * 4 || (rows.length >= 6 && p90 < SMALL_TEXT * 4);
        if (!structural && alike && lens.filter((l) => l > 0).length >= 3) rowSig = best;
      }
    }
    // Split. A tiny child does not stand alone: it goes with the next sizeable sibling,
    // or the previous one if it is last.
    let pendingTiny = [];
    let lastLeafIndex = -1;
    for (const k of kids) {
      if (rowSig && sig(k) === rowSig) {
        if (pendingTiny.length) { leaf([...pendingTiny, k], k); pendingTiny = []; } else leaf([k], k);
        lastLeafIndex = leaves.length - 1;
        continue;
      }
      if (tiny(k) && kids.length > 1) { pendingTiny.push(k); continue; }
      const before = leaves.length;
      walk(k, depth + 1, null);
      if (pendingTiny.length && leaves.length > before) {
        const first = leaves[before];
        first.els = [...pendingTiny, ...first.els];
        pendingTiny = [];
      }
      if (leaves.length > before) lastLeafIndex = leaves.length - 1;
    }
    if (pendingTiny.length) {
      if (lastLeafIndex >= 0) leaves[lastLeafIndex].els.push(...pendingTiny);
      else leaf(pendingTiny, top);
    }
  }
  walk(document.body, 0, null);

  // Merge runs of consecutive siblings with the same tag and class into one region:
  // paragraphs of an article, cards in a carousel, rows of a comment thread. Within-page
  // repetition is the unit the reader sees, and a lone card is a mixture no type fits.
  const merged = [];
  for (const { els, top } of leaves) {
    const prev = merged[merged.length - 1];
    const head = els[els.length - 1];
    if (prev && els.length === 1 && prev.els.length === prev.tops.length && sig(head) === prev.sig && top.previousElementSibling === prev.tops[prev.tops.length - 1]) { prev.els.push(head); prev.tops.push(top); }
    else merged.push({ sig: sig(head), els: [...els], tops: [top] });
  }
  for (const m of merged) m.run = m.tops.length > 1;

  function landmarks(el) {
    const out = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const role = n.getAttribute && n.getAttribute('role');
      if (LANDMARK.has(n.tagName)) out.push(n.tagName.toLowerCase());
      else if (role && /^(navigation|main|banner|contentinfo|complementary|search|form|dialog|region)$/.test(role)) out.push('role=' + role);
    }
    return out.reverse();
  }
  function images(els) {
    // Alt text and rendered size of the pictures in a region, largest first, so an
    // image-only region is not a blank to the labeller. Pictures under 8px (spacers,
    // tracking pixels) do not count as pictures.
    const out = [];
    for (const e of els) {
      const list = /^(IMG|SVG|VIDEO|CANVAS|PICTURE)$/.test(e.tagName) ? [e] : [...e.querySelectorAll('img,svg,video,canvas')];
      for (const img of list) {
        if (img.closest('picture') && img.tagName !== 'IMG') continue;
        const r = img.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        const alt = (img.getAttribute('alt') || img.getAttribute('title') || img.getAttribute('aria-label') || '').trim().slice(0, 120);
        out.push({ kind: img.tagName.toLowerCase(), alt, width: Math.round(r.width), height: Math.round(r.height) });
      }
    }
    out.sort((a, b) => b.width * b.height - a.width * a.height);
    return { count: out.length, list: out.slice(0, 4) };
  }
  function describe(m, index) {
    const els = m.els;
    const first = els[0], last = els[els.length - 1];
    const r0 = first.getBoundingClientRect(), r1 = last.getBoundingClientRect();
    const top = Math.min(r0.top, r1.top) + scrollY;
    const bottom = Math.max(r0.bottom, r1.bottom) + scrollY;
    const left = Math.min(r0.left, r1.left);
    const width = Math.max(r0.right, r1.right) - left;
    const t = els.map(text).join('\\n').trim();
    const q = (sel) => els.reduce((n, e) => n + e.querySelectorAll(sel).length, 0);
    const links = els.flatMap((e) => [...e.querySelectorAll('a[href]')]);
    const linkText = links.reduce((n, a) => n + (a.textContent || '').trim().length, 0);
    const main = m.tops.length > 1 ? first : (els.find((e) => !tiny(e)) || first);
    const own = (name) => (main.getAttribute(name) || '').slice(0, 80);
    const cls = (main.className && typeof main.className === 'string') ? main.className.trim().split(/\\s+/).slice(0, 4).join(' ') : '';
    const imgs = images(els);
    // A cross-origin frame has no text or pictures of its own; its host and size are
    // all there is to go on (consent walls, video embeds, live examples, chat bots).
    const frameEl = els.find((e) => e.tagName === 'IFRAME') || (els.length === 1 ? els[0].querySelector('iframe') : null);
    let frame;
    if (frameEl) {
      const fr = frameEl.getBoundingClientRect();
      let host = '';
      try { host = new URL(frameEl.src, location.href).host.replace(/^www[.]/, ''); } catch (_) {}
      frame = { host, width: Math.round(fr.width), height: Math.round(fr.height), title: (frameEl.title || '').slice(0, 80) || undefined };
    }
    return {
      index,
      tag: m.run ? main.tagName.toLowerCase() + '\\u00d7' + els.length : main.tagName.toLowerCase(),
      id: own('id') || undefined,
      class: cls || undefined,
      role: own('role') || undefined,
      ariaLabel: own('aria-label') || undefined,
      landmarks: landmarks(main),
      textLength: t.length,
      text: t.slice(0, 400),
      counts: {
        links: links.length,
        images: imgs.count,
        headings: q('h1,h2,h3,h4,h5,h6') + els.filter((e) => /^H[1-6]$/.test(e.tagName)).length,
        listItems: q('li'),
        tableRows: q('tr'),
        controls: q('input,textarea,select,button') + els.filter((e) => /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.tagName)).length,
        paragraphs: els.filter((e) => e.tagName === 'P').length + q('p'),
        repeats: m.tops.length,
      },
      images: imgs.count ? imgs.list : undefined,
      frame,
      linkTextRatio: t.length ? +(linkText / t.length).toFixed(2) : 0,
      geometry: {
        top: Math.round(top),
        height: Math.round(bottom - top),
        widthFraction: +(Math.min(width, vw) / vw).toFixed(2),
        leftFraction: +(left / vw).toFixed(2),
        pageFraction: +(top / pageH).toFixed(2),
        aboveFold: top < vh,
      },
    };
  }

  let regions = merged.map(describe);
  // Drop empty decorative bits. No cap: the corpus wants every region (NEXT.md B2).
  regions = regions.filter((r) => r.textLength > 0 || r.counts.images > 0 || r.counts.controls > 0 || (r.frame && r.frame.width >= 80 && r.frame.height >= 80));
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

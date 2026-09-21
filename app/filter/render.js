'use strict';
// The last two stages of the filter: order and lay out. Runs in the page preload.
//
// Builds Mondrian's document from the classified regions inside a closed shadow root
// on a host outside <body>, so the site's stylesheets cannot reach it and its layout
// cannot reach the site. Kept blocks are deep clones of the region's elements with
// the site's classes, ids, inline styles and handlers stripped (the layout language is
// layout.css, and nothing else). Demoted blocks are set aside under the column,
// folded. Dropped blocks are never emitted: they are counted and listed, each one
// click from being shown ("nothing is silently deleted").
//
// The site's own body is display:none while Mondrian's document shows; the page's
// scripts keep running against it, and "Original" swaps back at any time. Clones are
// not bound to the page, so a control in a clone does nothing; that is why controls
// are demoted and why the contained tier exists (ADR 0011, concept open question 4).

const KEEP_ATTRS = new Set(['href', 'src', 'srcset', 'sizes', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan', 'datetime', 'type', 'value', 'name', 'placeholder', 'checked', 'disabled', 'lang', 'dir', 'start', 'reversed', 'open', 'controls', 'poster', 'loading', 'cite', 'headers', 'scope', 'abbr', 'label', 'for', 'rel', 'target']);
const STRIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'NOSCRIPT', 'TEMPLATE', 'META', 'OBJECT', 'EMBED']);
const LAZY = ['data-src', 'data-lazy-src', 'data-original', 'data-srcset', 'data-lazy-srcset'];

function clean(node, opts) {
  if (node.nodeType !== 1) return node.nodeType === 3 ? node.cloneNode() : null; // a copy: the original stays in the page
  if (STRIP_TAGS.has(node.tagName)) return null;
  if (node.tagName === 'IFRAME' && !opts.frames) return null;
  // Inline SVG outside a media block is an icon or a logo, usually drawn from a sprite the
  // shadow root cannot see: an empty box. Icons are not part of the layout language.
  if ((node.tagName === 'svg' || node.tagName === 'SVG') && !opts.frames) return null;
  // A control in a clone is not bound to the page and does nothing; outside a controls
  // block it is noise (Wikipedia's 'move to sidebar', 'Toggle ... subsection').
  if (/^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(node.tagName) && !opts.controls) return null;
  const out = node.cloneNode(false);
  for (const a of [...out.attributes]) {
    const n = a.name.toLowerCase();
    if (n.startsWith('on') || !KEEP_ATTRS.has(n)) out.removeAttribute(a.name);
  }
  if (out.tagName === 'IMG') {
    if (!out.getAttribute('src') || /^data:image\/(gif|svg)/.test(out.getAttribute('src') || '')) {
      for (const l of LAZY) { const v = node.getAttribute(l); if (v && !l.includes('srcset')) { out.setAttribute('src', v); break; } }
    }
    if (!out.getAttribute('srcset')) { const v = node.getAttribute('data-srcset') || node.getAttribute('data-lazy-srcset'); if (v) out.setAttribute('srcset', v); }
    out.removeAttribute('loading');
  }
  if (out.tagName === 'A' && out.getAttribute('href')) { try { out.setAttribute('href', new URL(out.getAttribute('href'), location.href).href); } catch (_) {} }
  const kids = node.shadowRoot ? [...node.shadowRoot.childNodes, ...node.childNodes] : node.childNodes;
  for (const c of kids) { const k = clean(c, opts); if (k) out.appendChild(k); }
  return out;
}

function label(call) {
  return `${call.type.replace(/_/g, ' ')} · ${call.slot}${call.source === 'rules' ? '' : ' · ' + call.source}`;
}

function blockFor(region, call, opts) {
  const el = document.createElement('section');
  el.className = `mx-block mx-${call.block} mx-slot-${call.slot} mx-type-${call.type}`;
  if (call.type === 'title') el.classList.add('mx-title');
  if ((region.counts.repeats || 1) > 1) el.classList.add('mx-run');
  if (call.disposition === 'demote') el.classList.add('mx-demoted');
  el.dataset.mxIndex = String(region.index);
  el.dataset.mxType = call.type;
  el.dataset.mxLabel = label(call);
  const frames = call.block === 'media' || call.type === 'video' || call.type === 'embed';
  const controls = call.block === 'controls' || /form|search|login|settings|filters|poll|feedback/.test(call.type);
  let body = document.createDocumentFragment();
  for (const src of region.els || []) { const c = clean(src, { frames, controls }); if (c) body.appendChild(c); }
  if (region.frame && frames && !(region.els || []).some((e) => e.tagName === 'IFRAME')) {
    // a frame region whose element is the frame itself
    const f = (region.els || []).find((e) => e.tagName === 'IFRAME');
    if (f) body.appendChild(f.cloneNode(false));
  }
  if (region.frame && region.els && region.els[0] && region.els[0].tagName === 'IFRAME') {
    body = document.createDocumentFragment();
    const f = region.els[0].cloneNode(false);
    for (const a of [...f.attributes]) if (/^on/i.test(a.name)) f.removeAttribute(a.name);
    body.appendChild(f);
    el.classList.add('mx-frame');
  }
  if (call.block === 'thread') {
    const d = document.createElement('details');
    const s = document.createElement('summary');
    s.textContent = `${call.type.replace(/_/g, ' ')}${region.counts.repeats > 1 ? ` · ${region.counts.repeats}` : ''} — show`;
    d.appendChild(s); d.appendChild(body); el.appendChild(d);
  } else {
    el.appendChild(body);
  }
  if (!el.textContent.trim() && !el.querySelector('img,video,iframe,svg,canvas')) return null;
  return el;
}

function snippet(region) {
  const t = (region.text || region.coverLabel || '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 90) : (region.images ? `${region.images.length} image(s)` : region.frame ? `frame from ${region.frame.host}` : '(no text)');
}

// Build and mount. Returns the api the preload exposes to main.
function render({ regions, calls, counts, url, site, tier, elapsed }) {
  const host = document.createElement('div');
  host.id = 'mx-root';
  host.setAttribute('data-mondrian', 'document');
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = render.css;
  root.appendChild(style);

  const page = document.createElement('div');
  page.className = 'mx-page';
  root.appendChild(page);

  const strip = document.createElement('div');
  strip.className = 'mx-strip';
  strip.innerHTML = `<span><b>Mondrian</b> · relaid</span><span><b>${counts.keep}</b> kept</span><span><b>${counts.demote}</b> set aside</span><span><b>${counts.drop}</b> dropped</span><span>${elapsed} ms</span><span class="mx-right"><button data-mx-action="original">Original</button></span>`;
  page.appendChild(strip);

  const column = document.createElement('div');
  column.className = 'mx-column';
  page.appendChild(column);

  const aside = document.createElement('details');
  aside.className = 'mx-aside';
  const asideSummary = document.createElement('summary');
  aside.appendChild(asideSummary);
  const dropped = document.createElement('details');
  dropped.className = 'mx-dropped';
  const droppedSummary = document.createElement('summary');
  dropped.appendChild(droppedSummary);
  const droppedList = document.createElement('ol');
  dropped.appendChild(droppedList);

  const built = new Map(); // region index -> block element (kept or demoted)
  const skipped = [];
  let hasTitle = false;
  for (const r of regions) {
    const c = calls[r.index];
    if (c.disposition === 'drop') {
      const li = document.createElement('li');
      li.innerHTML = `<span class="mx-kind"></span><span class="mx-snip"></span><button data-mx-action="show" data-mx-index="${r.index}">show anyway</button>`;
      li.querySelector('.mx-kind').textContent = c.type.replace(/_/g, ' ');
      li.querySelector('.mx-snip').textContent = snippet(r);
      droppedList.appendChild(li);
      continue;
    }
    const b = blockFor(r, c, {});
    if (!b) { skipped.push([r.index, c.type, (r.els || []).map((e) => e.tagName + ':' + (e.textContent || '').length).join(',')]); continue; }
    if (c.type === 'title') hasTitle = true;
    built.set(r.index, b);
    if (c.disposition !== 'keep') { aside.appendChild(b); continue; }
    // Consecutive single cards share one grid; a run of cards is a grid of its own.
    if (c.block === 'cards' && (r.counts.repeats || 1) === 1) {
      let grid = column.lastElementChild;
      if (!grid || !grid.classList.contains('mx-grid')) { grid = document.createElement('div'); grid.className = 'mx-grid'; column.appendChild(grid); }
      grid.appendChild(b);
    } else if (c.type === 'byline' && column.lastElementChild && column.lastElementChild.classList.contains('mx-grid')) {
      // A byline right after a card is that card's byline (Hacker News: title row, then points row).
      b.classList.add('mx-card-byline');
      column.lastElementChild.lastElementChild.appendChild(b);
    } else column.appendChild(b);
  }
  if (!hasTitle && document.title) {
    const t = document.createElement('section');
    t.className = 'mx-block mx-heading mx-title mx-slot-article';
    t.dataset.mxLabel = 'title · document';
    const h = document.createElement('h1');
    h.textContent = document.title;
    t.appendChild(h);
    column.prepend(t);
  }
  if (!column.children.length) {
    const e = document.createElement('p');
    e.className = 'mx-empty';
    e.textContent = 'Nothing on this page classified as content. The original is one click away.';
    column.appendChild(e);
  }
  asideSummary.textContent = `${counts.demote} block${counts.demote === 1 ? '' : 's'} set aside — site navigation, tools, related links`;
  droppedSummary.textContent = `${counts.drop} block${counts.drop === 1 ? '' : 's'} dropped — promotion, notices, decoration`;
  if (counts.demote) page.appendChild(aside);
  if (counts.drop) page.appendChild(dropped);

  // The site's body is not painted while Mondrian's document shows.
  const veil = document.createElement('style');
  veil.id = 'mx-veil';
  veil.textContent = 'body { display: none !important; } html { opacity: 1 !important; background: #f6f3ec; } @media (prefers-color-scheme: dark) { html { background: #191816; } }';
  document.documentElement.appendChild(veil);
  document.documentElement.appendChild(host);

  const api = {
    host,
    skipped,
    showing: 'blocks',
    original() {
      veil.textContent = '#mx-root { display: none !important; } html { opacity: 1 !important; }';
      api.showing = 'original';
    },
    blocks() {
      veil.textContent = 'body { display: none !important; } html { opacity: 1 !important; }';
      api.showing = 'blocks';
    },
    // Re-emit a dropped block into the column, at its original position.
    show(index) {
      const r = regions[index], c = calls[index];
      if (!r || !c || built.has(index)) return false;
      const b = blockFor(r, { ...c, disposition: 'keep' }, {});
      if (!b) return false;
      b.classList.add('mx-shown');
      let after = null;
      for (const [i, el] of built) if (i < index && el.parentElement === column && (!after || i > Number(after.dataset.mxIndex))) after = el;
      if (after) after.after(b); else column.prepend(b);
      built.set(index, b);
      const li = droppedList.querySelector(`button[data-mx-index="${index}"]`);
      if (li) li.closest('li').remove();
      counts.drop--; counts.keep++;
      return true;
    },
    text() { return column.innerText; },
    debug() { return { column: [...column.children].map((c) => [c.dataset.mxIndex, c.className, c.textContent.length]), aside: [...aside.querySelectorAll('.mx-block')].map((c) => [c.dataset.mxIndex, c.textContent.length]), skipped: api.skipped }; },
    remove() { host.remove(); veil.remove(); },
  };
  root.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('button[data-mx-action]');
    if (!btn) return;
    if (btn.dataset.mxAction === 'original') api.original();
    if (btn.dataset.mxAction === 'show') api.show(Number(btn.dataset.mxIndex));
  });
  return api;
}
render.css = '';

module.exports = { render, clean };

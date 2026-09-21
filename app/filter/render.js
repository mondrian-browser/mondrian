'use strict';
// The last two stages of the filter: order and lay out. Runs in the page preload.
//
// Builds Mondrian's document from the classified regions inside a closed shadow root
// on a host outside <body>, so the site's stylesheets cannot reach it and its layout
// cannot reach the site. Every kept block is a card with a label (layout.css is the
// whole layout language); kept blocks are deep clones of the region's elements with
// the site's classes, ids, inline styles, handlers, icons and dead controls stripped.
//
// Composition rules, in the order they apply:
//   - a byline right after the title joins the title card; a byline after a teaser
//     card joins that card
//   - a heading joins the block it introduces (prose, list, table, code, quote, facts,
//     media) as that card's heading; a heading before anything else stands alone
//   - consecutive single teaser cards share one grid; a run of cards is a grid itself
//   - two consecutive short blocks of the small kinds (list, links, facts, controls)
//     sit side by side
// Demoted blocks are set aside, listed in the rail and shown under the column on
// request. Dropped blocks are never emitted: counted and listed, one click from being
// shown ("nothing is silently deleted").
//
// The site's own body is display:none while Mondrian's document shows; the page's
// scripts keep running against it, and "Original" swaps back at any time. Clones are
// not bound to the page, so a control in a clone does nothing; that is why controls
// are demoted and why the contained tier exists (ADR 0011, concept open question 4).

const KEEP_ATTRS = new Set(['href', 'src', 'srcset', 'sizes', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan', 'datetime', 'type', 'value', 'name', 'placeholder', 'checked', 'disabled', 'lang', 'dir', 'start', 'reversed', 'open', 'controls', 'poster', 'cite', 'headers', 'scope', 'abbr', 'label', 'for', 'rel', 'target']);
const STRIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'NOSCRIPT', 'TEMPLATE', 'META', 'OBJECT', 'EMBED']);
const LAZY = ['data-src', 'data-lazy-src', 'data-original', 'data-srcset', 'data-lazy-srcset'];
const SMALL_KINDS = new Set(['list', 'links', 'pairs', 'controls', 'mixed']);
const JOINABLE = new Set(['prose', 'list', 'table', 'code', 'quote', 'pairs', 'media', 'thread']);
const BLOCK_NAMES = { heading: 'heading', prose: 'text', list: 'list', table: 'table', code: 'code', quote: 'quote', media: 'media', cards: 'cards', thread: 'comments', links: 'links', controls: 'control', pairs: 'facts', frame: 'media', mixed: 'block', empty: '' };

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
  }
  if (out.tagName === 'A' && out.getAttribute('href')) { try { out.setAttribute('href', new URL(out.getAttribute('href'), location.href).href); } catch (_) {} }
  const kids = node.shadowRoot ? [...node.shadowRoot.childNodes, ...node.childNodes] : node.childNodes;
  for (const c of kids) { const k = clean(c, opts); if (k) out.appendChild(k); }
  return out;
}

const words = (t) => String(t || '').replace(/_/g, ' ');

function labelFor(call) {
  const block = BLOCK_NAMES[call.block] ?? call.block;
  const type = words(call.type);
  const text = block && type !== block && !(call.block === 'prose' && call.type === 'text') ? `${block} · <b>${type}</b>` : (block || type);
  return `${text}<span class="mx-src">${call.source === 'rules' ? '' : call.source}</span>`;
}

function makeCard(call, region) {
  const el = document.createElement('section');
  el.className = `mx-block mx-${call.block} mx-slot-${call.slot} mx-type-${call.type}`;
  if (call.type === 'title') el.classList.add('mx-title');
  if ((region.counts.repeats || 1) > 1) el.classList.add('mx-run');
  el.dataset.mxIndex = String(region.index);
  el.dataset.mxType = call.type;
  const label = document.createElement('span');
  label.className = 'mx-label';
  label.innerHTML = labelFor(call);
  label.title = `${call.type} · ${call.block} · ${call.slot}${call.confidence != null ? ` · ${call.source} ${call.confidence}` : ` · ${call.source}`}${call.rule ? ` · rule ${call.rule}` : ''}`;
  el.appendChild(label);
  const inner = document.createElement('div');
  inner.className = 'mx-inner';
  el.appendChild(inner);
  return { el, inner };
}

function contentOf(region, call) {
  const frames = call.block === 'media' || call.type === 'video' || call.type === 'embed';
  const controls = call.block === 'controls' || /form|search|login|settings|filters|poll|feedback/.test(call.type);
  const body = document.createDocumentFragment();
  if (region.frame && region.els && region.els[0] && region.els[0].tagName === 'IFRAME') {
    const f = region.els[0].cloneNode(false);
    for (const a of [...f.attributes]) if (/^on/i.test(a.name)) f.removeAttribute(a.name);
    body.appendChild(f);
    return body;
  }
  for (const src of region.els || []) { const c = clean(src, { frames, controls }); if (c) body.appendChild(c); }
  return body;
}

// Headings get the layout language's classes, whatever tag the site used.
function markHeading(fragment, level) {
  const h = fragment.querySelector && fragment.querySelector('h1,h2,h3,h4,h5,h6');
  if (h) { const n = Math.max(2, Math.min(4, level || Number(h.tagName[1]))); h.className = `mx-h${n}`; }
  return fragment;
}

function blockFor(region, call) {
  const { el, inner } = makeCard(call, region);
  const body = contentOf(region, call);
  if (call.block === 'heading') {
    if (call.type === 'title') { const h = body.querySelector && body.querySelector('h1,h2,h3,h4,h5,h6'); if (h) h.className = 'mx-h'; }
    else markHeading(body);
  } else if (body.querySelectorAll && /^(prose|list|quote|pairs|table)$/.test(call.block)) {
    // Headings inside a reading block (a chunked article body) take the language's styles too.
    for (const h of body.querySelectorAll('h1,h2,h3,h4,h5,h6')) h.className = `mx-h${Math.max(2, Math.min(4, Number(h.tagName[1])))}`;
  }
  if (call.block === 'thread') {
    const d = document.createElement('details');
    const s = document.createElement('summary');
    s.textContent = `${words(call.type)}${region.counts.repeats > 1 ? ` · ${region.counts.repeats}` : ''} — show`;
    d.appendChild(s); d.appendChild(body); inner.appendChild(d);
  } else if (call.block === 'media') {
    inner.appendChild(body);
    const im = (region.images || [])[0];
    if (im && im.width >= 200 && !inner.querySelector('figcaption')) {
      const meta = document.createElement('div');
      meta.className = 'mx-meta';
      meta.textContent = `${im.width} × ${im.height}${im.alt ? ' · ' + im.alt.slice(0, 80) : ''}`;
      inner.appendChild(meta);
    }
  } else {
    inner.appendChild(body);
  }
  if (!inner.textContent.trim() && !inner.querySelector('img,video,iframe,canvas')) return null;
  return el;
}

function snippet(region) {
  const t = (region.text || region.coverLabel || '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 90) : (region.images ? `${region.images.length} image(s)` : region.frame ? `frame from ${region.frame.host}` : '(no text)');
}

function railCard(labelText) {
  const el = document.createElement('section');
  el.className = 'mx-block';
  const label = document.createElement('span');
  label.className = 'mx-label';
  label.textContent = labelText;
  el.appendChild(label);
  return el;
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

  // The strip: where you are, what the filter did.
  let pathBit = '';
  try { const u = new URL(url); pathBit = u.host.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname.replace(/\/$/, '').slice(0, 48) : ''); } catch (_) { pathBit = site || ''; }
  const strip = document.createElement('div');
  strip.className = 'mx-strip';
  strip.innerHTML = `<span class="mx-dot"></span><span class="mx-host"></span><span>${counts.keep} blocks kept · ${counts.demote} set aside · ${counts.drop} dropped</span><span class="mx-right"><span class="mx-state">relaid · ${elapsed} ms</span><button data-mx-action="original">Original</button></span>`;
  strip.querySelector('.mx-host').textContent = pathBit;
  page.appendChild(strip);

  const body = document.createElement('div');
  body.className = 'mx-body';
  page.appendChild(body);
  const column = document.createElement('div');
  column.className = 'mx-column';
  body.appendChild(column);
  const rail = document.createElement('div');
  rail.className = 'mx-rail';
  body.appendChild(rail);

  const built = new Map();     // region index -> card
  const skipped = [];
  const asideBlocks = [];      // demoted cards, shown on request
  const droppedRows = [];
  let pendingHeading = null;   // a heading waiting for the block it introduces
  let lastKept = null;         // { call, el }
  let titleEl = null;          // the title card, for a byline that follows the summary

  const place = (el) => { column.appendChild(el); };
  const flushHeading = () => { if (pendingHeading) { place(pendingHeading.el); lastKept = pendingHeading; pendingHeading = null; } };

  for (const r of regions) {
    const c = calls[r.index];
    if (c.disposition === 'drop') { droppedRows.push({ r, c }); continue; }
    const el = blockFor(r, c);
    if (!el) { skipped.push([r.index, c.type]); continue; }
    built.set(r.index, el);
    if (c.disposition === 'demote') { asideBlocks.push(el); continue; }

    // Bylines join what they belong to.
    const bylineHome = c.type === 'byline' && !pendingHeading && lastKept && (lastKept.call.type === 'title' ? lastKept.el : lastKept.call.block === 'cards' ? lastKept.el : lastKept.call.type === 'summary' && titleEl && column.children.length <= 3 ? titleEl : null);
    if (bylineHome) {
      const inner = el.querySelector('.mx-inner');
      inner.className = bylineHome === titleEl ? 'mx-byline' : 'mx-card-byline';
      bylineHome.querySelector('.mx-inner').appendChild(inner);
      lastKept = { call: c, el: bylineHome };
      built.set(r.index, bylineHome);
      continue;
    }
    // A heading waits for the block it introduces.
    if (c.block === 'heading' && c.type !== 'title') {
      flushHeading();
      pendingHeading = { call: c, el };
      continue;
    }
    if (pendingHeading) {
      if (JOINABLE.has(c.block)) {
        const h = pendingHeading.el.querySelector('.mx-inner').firstElementChild;
        if (h) el.querySelector('.mx-inner').prepend(h);
        built.set(Number(pendingHeading.el.dataset.mxIndex), el);
        pendingHeading = null;
      } else flushHeading();
    }
    // Consecutive text merges into one card: a section is one block, and a heading starts the next.
    if ((c.block === 'prose' || c.block === 'pairs') && lastKept && lastKept.call.block === c.block && lastKept.call.type !== 'summary' && c.type !== 'summary' && lastKept.el.parentElement === column && !pendingHeading) {
      const from = el.querySelector('.mx-inner'), to = lastKept.el.querySelector('.mx-inner');
      while (from.firstChild) to.appendChild(from.firstChild);
      built.set(r.index, lastKept.el);
      continue;
    }
    // Cards share a grid; small blocks pair up.
    if (c.block === 'cards' && (r.counts.repeats || 1) === 1) {
      let grid = column.lastElementChild;
      if (!grid || !grid.classList.contains('mx-grid')) { grid = document.createElement('div'); grid.className = 'mx-grid'; const gl = document.createElement('span'); gl.className = 'mx-label mx-grid-label'; gl.innerHTML = labelFor(c); grid.appendChild(gl); column.appendChild(grid); }
      grid.appendChild(el);
    } else if (SMALL_KINDS.has(c.block) && r.textLength < 600 && lastKept && SMALL_KINDS.has(lastKept.call.block) && lastKept.el.parentElement === column && !lastKept.el.classList.contains('mx-rowed')) {
      const row = document.createElement('div');
      row.className = 'mx-row';
      column.replaceChild(row, lastKept.el);
      row.appendChild(lastKept.el); row.appendChild(el);
      lastKept.el.classList.add('mx-rowed'); el.classList.add('mx-rowed');
    } else place(el);
    lastKept = { call: c, el };
    if (c.type === 'title') titleEl = el;
  }
  flushHeading();

  // A grid of image-less short cards is a listing (Hacker News, a forum index): one card,
  // one row per item, a byline-looking row joining the row above it.
  for (const grid of [...column.querySelectorAll('.mx-grid')]) {
    const cards = [...grid.querySelectorAll(':scope > .mx-block')];
    if (cards.length < 4 || cards.some((c) => c.querySelector('img,video'))) continue;
    const avg = cards.reduce((n, c) => n + c.textContent.trim().length, 0) / cards.length;
    if (avg > 220) continue;
    const listing = document.createElement('section');
    listing.className = 'mx-block mx-listing';
    const gl = grid.querySelector('.mx-grid-label');
    if (gl) listing.appendChild(gl);
    const inner = document.createElement('div');
    inner.className = 'mx-inner';
    listing.appendChild(inner);
    let last = null;
    for (const c of cards) {
      const text = c.textContent.trim();
      if (last && /^d+ points? by|^d+ (comments?|replies)|^(by |S+ )?d+ (minutes?|hours?|days?) ago/i.test(text) && text.length < 160) {
        const by = document.createElement('div'); by.className = 'mx-card-byline'; by.append(...c.querySelector('.mx-inner').childNodes); last.appendChild(by);
        built.set(Number(c.dataset.mxIndex), listing); continue;
      }
      const row = document.createElement('div'); row.className = 'mx-row-item'; row.dataset.mxIndex = c.dataset.mxIndex;
      row.append(...c.querySelector('.mx-inner').childNodes);
      inner.appendChild(row); last = row;
      built.set(Number(c.dataset.mxIndex), listing);
    }
    listing.dataset.mxIndex = cards[0].dataset.mxIndex;
    grid.replaceWith(listing);
  }

  if (!column.children.length) {
    const e = document.createElement('p');
    e.className = 'mx-empty';
    e.textContent = 'Nothing on this page classified as content. The original is one click away.';
    column.appendChild(e);
  }

  // ---- the rail
  const visit = railCard('this visit');
  visit.innerHTML += `<div class="mx-big">${elapsed}<small>ms to blocks</small></div>`;
  rail.appendChild(visit);

  const onPage = railCard('blocks on this page');
  const tally = {};
  for (const r of regions) { const c = calls[r.index]; if (c.disposition === 'keep' && built.has(r.index)) tally[c.block] = (tally[c.block] || 0) + 1; }
  const ul = document.createElement('ul');
  for (const [b, n] of Object.entries(tally).sort((a, b2) => b2[1] - a[1])) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="mx-sw mx-sw-${b}"></span><span></span><span class="mx-n">${n}</span>`;
    li.children[1].textContent = BLOCK_NAMES[b] || b;
    ul.appendChild(li);
  }
  onPage.appendChild(ul);
  rail.appendChild(onPage);

  let asideHost = null;
  if (asideBlocks.length) {
    const aside = railCard('set aside');
    aside.classList.add('mx-aside');
    const al = document.createElement('ul');
    const at = {};
    for (const el of asideBlocks) at[el.dataset.mxType] = (at[el.dataset.mxType] || 0) + 1;
    for (const [t, n] of Object.entries(at)) { const li = document.createElement('li'); li.innerHTML = `<span class="mx-sw mx-sw-links"></span><span></span><span class="mx-n">${n}</span>`; li.children[1].textContent = words(t); al.appendChild(li); }
    aside.appendChild(al);
    const btn = document.createElement('button');
    btn.dataset.mxAction = 'aside';
    btn.textContent = 'Show them under the column';
    aside.appendChild(btn);
    rail.appendChild(aside);
  }

  if (droppedRows.length) {
    const dropped = railCard('dropped by the filter');
    dropped.classList.add('mx-dropped');
    const dl = document.createElement('ul');
    for (const { r, c } of droppedRows) {
      const li = document.createElement('li');
      li.innerHTML = `<span></span><span class="mx-snip"></span>`;
      li.children[0].textContent = words(c.type);
      li.children[1].textContent = snippet(r);
      li.dataset.mxIndex = String(r.index);
      dl.appendChild(li);
    }
    dropped.appendChild(dl);
    const btn = document.createElement('button');
    btn.dataset.mxAction = 'show-all';
    btn.textContent = 'Show them anyway';
    dropped.appendChild(btn);
    rail.appendChild(dropped);
  }

  const note = railCard('same layout, every site');
  note.classList.add('mx-note');
  note.innerHTML += 'A recipe blog, a PDF, a forum thread and this page all arrive as the same set of block types, in the same measure and rhythm.';
  rail.appendChild(note);

  // The site's body is not painted while Mondrian's document shows.
  const veil = document.createElement('style');
  veil.id = 'mx-veil';
  const SHOW_BLOCKS = 'body { display: none !important; } html { opacity: 1 !important; background: #f2efe8; } @media (prefers-color-scheme: dark) { html { background: #171614; } }';
  const SHOW_ORIGINAL = '#mx-root { display: none !important; } html { opacity: 1 !important; }';
  veil.textContent = SHOW_BLOCKS;
  document.documentElement.appendChild(veil);
  document.documentElement.appendChild(host);

  const api = {
    host,
    skipped,
    showing: 'blocks',
    original() { veil.textContent = SHOW_ORIGINAL; api.showing = 'original'; },
    blocks() { veil.textContent = SHOW_BLOCKS; api.showing = 'blocks'; },
    // Re-emit a dropped block into the column, at its original position.
    show(index) {
      const r = regions[index], c = calls[index];
      if (!r || !c || built.has(index)) return false;
      const b = blockFor(r, { ...c, disposition: 'keep' });
      if (!b) return false;
      b.classList.add('mx-shown');
      let after = null;
      for (const [i, el] of built) if (i < index && column.contains(el) && (!after || i > Number(after.dataset.mxIndex))) after = el;
      const anchor = after && (after.closest('.mx-grid, .mx-row') || after);
      if (anchor && anchor.parentElement === column) anchor.after(b); else column.prepend(b);
      built.set(index, b);
      const li = rail.querySelector(`li[data-mx-index="${index}"]`);
      if (li) li.remove();
      counts.drop--; counts.keep++;
      return true;
    },
    aside() {
      if (asideHost) { asideHost.remove(); asideHost = null; return false; }
      asideHost = document.createElement('div');
      asideHost.className = 'mx-aside-blocks';
      for (const el of asideBlocks) asideHost.appendChild(el);
      column.appendChild(asideHost);
      return true;
    },
    text() { return column.innerText; },
    debug() { return { column: [...column.querySelectorAll('.mx-block')].map((c) => [c.dataset.mxIndex, c.className, c.textContent.length]), aside: asideBlocks.map((c) => [c.dataset.mxIndex, c.textContent.length]), skipped }; },
    remove() { host.remove(); veil.remove(); },
  };
  root.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('button[data-mx-action]');
    if (!btn) return;
    const a = btn.dataset.mxAction;
    if (a === 'original') api.original();
    if (a === 'show') api.show(Number(btn.dataset.mxIndex));
    if (a === 'show-all') { for (const { r } of [...droppedRows]) api.show(r.index); }
    if (a === 'aside') api.aside();
  });
  return api;
}
render.css = '';

module.exports = { render, clean };

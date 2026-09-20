// Two axes for every region: what it is (block) and what its section is for (slot).
//
// The 100 types in questions.js mix the two. "heading" says what a region is and
// nothing about where it sits; "related" says what a section is for and nothing about
// whether the region is its heading, its cards or its "see all" link. One label cannot
// hold both, and the scorer counted a call as wrong when it was right about one axis:
// the h2 "Related stories" is a heading (block) in a related slot (slot), and calling
// it either was marked half wrong. The layout engine wants exactly this split: the
// block decides how a region renders, the slot decides whether and where.
//
// This is not a smaller taxonomy. Every type keeps its name; it now also says which
// axis it lives on, and structural types get a slot from their section.
//
//   deriveAxes(regions, types) -> [{ block, slot }]   same function for labels and calls
//
// Structural types (BLOCK_OF) inherit their slot: a heading takes the slot of the next
// region in its section, anything else the slot of the previous. A region whose type is
// a slot type sets the slot for what follows, until the landmark changes. The default
// slot is `article` inside main/article, `page` elsewhere.

'use strict';

// Structural types: the block they are. Everything not listed here is a slot type.
const BLOCK_OF = {
  title: 'heading', heading: 'heading',
  text: 'prose', summary: 'prose', quote: 'quote', callout: 'prose', transcript: 'prose', footnote: 'prose',
  list: 'list', steps: 'list', definition_list: 'list', references: 'list',
  table: 'table', infobox: 'pairs', metadata: 'pairs', stats: 'pairs',
  code: 'code', math: 'code',
  image: 'media', gallery: 'media', video: 'media', audio: 'media', chart: 'media', map: 'media', canvas: 'media', embed: 'media',
  decoration: 'empty', unclear: 'mixed',
};

// Slot types: the slot they declare. The value is the slot name; most are the type
// itself, a few fold into one slot because the section is the same thing (a footer's
// legal line, links and newsletter box are all the footer).
const SLOT_OF = {
  site_header: 'header', site_nav: 'header', search: 'header', account: 'header', skip_link: 'header', site_notice: 'header',
  site_footer: 'footer', legal_notice: 'footer',
  section_nav: 'nav', breadcrumbs: 'nav', table_of_contents: 'nav', pagination: 'nav', tabs: 'nav', version_switcher: 'nav', settings: 'nav', filters: 'nav',
  byline: 'byline', author_bio: 'author', badge: 'byline', correction: 'notice', disclosure: 'notice', content_warning: 'notice',
  comments: 'comments', reviews: 'reviews', rating: 'reviews', reactions: 'comments', vote_controls: 'comments', user_card: 'comments',
  related: 'related', teaser_card: 'teasers', product_card: 'listing', trending: 'trending', tag_cloud: 'tags', external_links: 'related',
  ad: 'ad', sponsored: 'ad', cross_promo: 'promo', newsletter: 'promo', subscribe: 'promo', paywall: 'paywall', app_nag: 'promo',
  hero: 'hero', feature_grid: 'features', cta: 'cta', testimonial: 'testimonials', logo_cloud: 'features', team: 'features', pricing_table: 'pricing',
  form: 'form', login_form: 'form', poll: 'form', feedback: 'form', contact_details: 'contact', download: 'article', calendar: 'article',
  toolbar: 'tools', page_tools: 'tools', share: 'tools', action_button: 'tools', accordion: 'article',
  cookie_banner: 'gate', consent_gate: 'gate', age_gate: 'gate', popup: 'gate', sticky_bar: 'gate', chat_widget: 'gate',
  buy_box: 'listing', cart: 'listing', checkout: 'listing',
  status_message: 'notice', empty_state: 'notice', progress: 'notice',
};

// Slots that open a section: what follows in the same landmark belongs to them until
// another opens. Every other slot is a point: the region has it, its neighbours do not.
const OPENS = new Set(['header', 'footer', 'nav', 'comments', 'reviews', 'related', 'teasers', 'trending', 'promo', 'features', 'testimonials', 'listing', 'pricing', 'hero', 'gate', 'tags']);

// Block for a slot type, from the region's own structure when the type does not say.
function structuralBlock(r) {
  const tag = (r.tag || '').replace(/×\d+$/, '');
  const c = r.counts || {};
  if (r.frame) return 'media';
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'pre') return 'code';
  if (tag === 'table' || tag === 'tbody') return 'table';
  if (tag === 'blockquote') return 'quote';
  if (/^(img|figure|picture|video|audio|canvas|svg|iframe)$/.test(tag)) return 'media';
  if (/^(button|input|select|textarea|label|form)$/.test(tag)) return 'controls';
  if (tag === 'ul' || tag === 'ol' || tag === 'dl') return r.linkTextRatio >= 0.6 ? 'links' : 'list';
  if (r.textLength === 0) return c.images > 0 ? 'media' : c.controls > 0 ? 'controls' : 'empty';
  if (c.controls >= 2 && r.textLength < 200) return 'controls';
  if (r.linkTextRatio >= 0.6 && c.links >= 3) return (c.images >= 1 || c.headings >= 1) ? 'cards' : 'links';
  if ((c.repeats || 1) > 1 && (c.headings >= 1 || c.images >= 1)) return 'cards';
  if (c.paragraphs >= 1 || r.textLength >= 120) return 'prose';
  if (c.headings >= 1 && r.textLength < 80) return 'heading';
  return 'mixed';
}

function blockOf(type, r) {
  if (BLOCK_OF[type]) return BLOCK_OF[type];
  if (type === 'teaser_card' || type === 'product_card' || type === 'user_card' || type === 'related' || type === 'trending' || type === 'feature_grid' || type === 'team' || type === 'logo_cloud') return 'cards';
  if (type === 'comments' || type === 'reviews') return 'thread';
  if (type === 'site_nav' || type === 'section_nav' || type === 'breadcrumbs' || type === 'table_of_contents' || type === 'tag_cloud' || type === 'external_links') return 'links';
  return structuralBlock(r);
}

const isStructural = (type) => !!BLOCK_OF[type];
const landmarkKey = (r) => (r.landmarks || []).join('>');
const defaultSlot = (r) => /main|article|role=main/.test(landmarkKey(r)) ? 'article' : 'page';

// regions: the page's regions in order; types: the type per region (labels or calls).
function deriveAxes(regions, types) {
  const n = regions.length;
  const block = new Array(n), slot = new Array(n);
  for (let i = 0; i < n; i++) block[i] = blockOf(types[i], regions[i]);
  // Sections: a new one starts at every heading and at every landmark change. A
  // section's slot is the first section-opening slot type inside it, else the default
  // for where it is. Structural regions take their section's slot; point slot types
  // keep their own.
  let start = 0;
  const flush = (end) => {
    let sectionSlot = null;
    for (let i = start; i < end; i++) {
      const t = types[i];
      if (isStructural(t)) continue;
      const sl = SLOT_OF[t] || t;
      if (OPENS.has(sl)) { sectionSlot = sl; break; }
    }
    if (!sectionSlot) sectionSlot = defaultSlot(regions[start]);
    for (let i = start; i < end; i++) {
      const t = types[i];
      slot[i] = isStructural(t) ? sectionSlot : (SLOT_OF[t] || t);
    }
    start = end;
  };
  for (let i = 1; i < n; i++) {
    if (block[i] === 'heading' && isStructural(types[i]) || landmarkKey(regions[i]) !== landmarkKey(regions[i - 1])) flush(i);
  }
  if (n > start) flush(n);
  return regions.map((_, i) => ({ block: block[i], slot: slot[i] }));
}

const SLOTS = [...new Set([...Object.values(SLOT_OF), 'article', 'page'])];
const BLOCKS = [...new Set([...Object.values(BLOCK_OF), 'cards', 'thread', 'links', 'controls', 'mixed', 'empty'])];

module.exports = { BLOCK_OF, SLOT_OF, OPENS, BLOCKS, SLOTS, deriveAxes, blockOf, isStructural };

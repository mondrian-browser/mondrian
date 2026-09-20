// The questions Jev is asked, and the thresholds that route its answers.
//
// This is the one file to review. Everything Jev is told about Mondrian's taxonomy is
// here, and nothing about it lives anywhere else. Question IDs are for code only and
// are not sent to the model, so each question carries its full meaning in its text.
//
// The type list is deliberately wide. Jev labels the corpus offline (ADR 0009), so the
// number of types costs nothing there; the point of the trial is to find out which
// distinctions a decision model can actually make on real pages. Whether the layout
// rules or the block policy later group some of these is a separate decision and does
// not constrain this list. Types that Jev cannot separate from their neighbours at
// useful confidence get merged after the corpus run, not before.
//
// Groups are comments only. The model sees one flat set of options.

'use strict';

const BLOCK_TYPES = {
  // ---- the thing the reader came for
  title: 'The title of the page or article itself: the single main heading, usually the largest text and near the top.',
  heading: 'A section or subsection heading within the content: short, sets up what follows, not the page title.',
  summary: 'A standfirst, lede, abstract, or deck: one or two sentences summarising the article, placed before the body.',
  text: 'Running prose the reader came to read: paragraphs of an article, an answer, a description, a story, documentation.',
  byline: 'Who wrote it and when: author name, publication date, updated date, reading time, source attribution.',
  metadata: 'Facts about the item shown as labelled values: tags, categories, prep time, servings, difficulty, price, specifications, version, licence.',
  image: 'A single still image or illustration that is part of the content, with or without a caption.',
  gallery: 'Several content images shown together as a set: a gallery, a slideshow of photos, a row of figures.',
  video: 'A video player or embedded video that is part of the content.',
  audio: 'An audio player or podcast episode that is part of the content.',
  table: 'Tabular data: rows and columns of values, a comparison grid, a spec sheet, a timetable, a compatibility matrix.',
  list: 'A list that is content: bullet points, ingredients, features, a list of items without a fixed order.',
  steps: 'An ordered sequence of instructions the reader follows in order: method, procedure, tutorial steps, numbered directions.',
  quote: 'A quotation set apart from the prose: a blockquote, a pull quote, an epigraph.',
  code: 'A code sample, terminal output, configuration, or other preformatted text meant to be read literally.',
  math: 'A displayed mathematical formula or equation.',
  callout: 'A boxed note, tip, warning, or important notice inside the content flow that the author set apart.',
  infobox: 'A summary panel of key facts about the subject, usually at the side or top: an encyclopedia infobox, a key-facts box, a recipe overview panel.',
  footnote: 'Footnotes or endnotes: numbered notes referred to from the text, shown at the bottom.',
  references: 'A bibliography, citation list, sources, or works cited: the list of things the content cites.',
  table_of_contents: 'A list of links to sections within this same page: "In this article", "Contents", "Jump to".',
  embed: 'An interactive widget embedded in the content that runs as built: a live code sample, an interactive chart or map, a calculator, a social media post, a poll.',
  comments: 'User comments, replies, reviews, or a discussion thread beneath or beside the main content.',
  rating: 'An aggregate rating or vote display: stars, score out of ten, number of ratings, upvote count.',
  tabs: 'A strip of tabs or toggles that switch which part of the content is shown, without leaving the page: Ingredients | Nutrition, Overview | Specs | Reviews, Metric | US.',
  // ---- links to elsewhere
  related: 'Links to other content on the same site chosen for this page: related articles, see also, you might also like, more from this author, more in this series.',
  teaser_card: 'A repeated card or list item that previews another page: headline plus a summary, image, or timestamp, linking to the full item. The unit of news indexes, search results, product listings, and recipe collections.',
  pagination: 'Controls to move between pages of a listing or thread: page numbers, next, previous, load more, older, newer.',
  external_links: 'Links out to other websites presented as a list: official site, further reading elsewhere, download mirrors.',
  // ---- things the reader operates
  form: 'A form the reader fills in and submits as part of using the content: login, sign up, comment box, contact form, checkout, settings.',
  search: 'A search box: site search, filter input, find within this section.',
  action_button: 'A button or small control that acts on the current item: save, print, download, play, copy, bookmark, follow, add to cart.',
  // ---- site furniture, the same on every page
  site_header: 'The site masthead: logo, site name, top bar, the strip at the very top that identifies the site.',
  site_nav: 'The site-wide navigation menu: main sections, primary menu, hamburger menu contents.',
  section_nav: 'Navigation within a section of the site: a sidebar tree of pages in the docs, a category submenu, chapter list.',
  breadcrumbs: 'The trail of links showing where this page sits in the site: Home > Recipes > Cakes.',
  page_tools: 'Tools that act on the page as an object rather than its content: edit, history, view source, language switcher, print view, cite this page, report a problem.',
  account: "Login, sign-in, profile, account menu, notifications, cart icon: the reader's relationship with the site.",
  share: 'Buttons to share the page on social networks, copy the link, email it.',
  site_footer: 'The site-wide footer: about, contact, legal links, copyright, sitemap, social links at the bottom of every page.',
  cookie_banner: 'A cookie consent, privacy notice, or GDPR banner asking the reader to accept or manage tracking.',
  // ---- promotion
  ad: 'An advertisement: a display ad, an ad slot, sponsored product placement from a third party.',
  sponsored: 'Content presented like articles but paid for: sponsored posts, promoted stories, partner content, affiliate product picks.',
  newsletter: 'A prompt to subscribe to a newsletter or email list.',
  subscribe: 'A prompt to subscribe to, pay for, or upgrade the site itself: membership, premium, support us, donate.',
  paywall: 'A notice that the content is limited or hidden until the reader pays or logs in, including "you have N free articles left".',
  app_nag: "A prompt to install or open the site's mobile app, or to enable notifications.",
  // ---- nothing
  decoration: 'A purely visual element with no content: spacer, divider, background image, decorative icon, empty container.',
  unclear: 'None of the above fits, or the region mixes several types so evenly that no one type describes it.',
};

// Confidence below which a label is routed to Lloyd for review. Provisional: the
// TypeSafe docs give no universal number and say to calibrate on your own data, which
// is what the review pass in B2 produces. Revisit after the first corpus run.
const REVIEW_BELOW = 0.5;

// Per region: which block type is this. The region is described structurally in state
// (see extract.js for the exact fields) rather than as raw HTML, because Jev's accuracy
// falls as the state fills with content unrelated to the decision.
function regionQuestion() {
  return {
    type: 'choice',
    instructions: {
      question: 'Which one block type best describes the page region given in `region`?',
      context: [
        'Mondrian is a browser that takes every web page apart into typed blocks and lays them out again in one layout language. Each type gets its own layout and its own show-or-drop rule, so the type should say what the region is for, not just what tag it uses.',
        'Use `region.text` and the structural counts to decide. `region.before` and `region.after` are the neighbouring regions, for context only.',
        'If `region.counts.repeats` is more than one, the region is a run of similar sibling elements: type the run as a whole, not its first member.',
        'Site furniture is anything that would be the same on every page of this site. Content is what is specific to this page.',
      ],
    },
    criteria: BLOCK_TYPES,
  };
}

// Per page: is this a document or an application. Decides the rendering tier (ADR 0011):
// documents are relaid out into blocks; applications are skinned or contained.
function applicationQuestion() {
  return {
    type: 'noul',
    instructions: {
      question: 'Is the page described in `page` primarily an application the user operates, rather than a document the user reads?',
      context: [
        'An application is something like a drawing tool, a spreadsheet, a mail client, a map, a game, or a dashboard: its value is in interacting with it, and taking it apart into reading blocks would destroy it.',
        'A document is something read: an article, a recipe, a reference page, a forum thread, a product listing, search results. Documents can have forms and controls on them and still be documents.',
        'Judge from the page title, the URL, and the summary of what its regions contain.',
      ],
    },
  };
}

module.exports = { BLOCK_TYPES, REVIEW_BELOW, regionQuestion, applicationQuestion };

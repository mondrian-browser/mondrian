// The questions Jev is asked, and the thresholds that route its answers.
//
// This is the one file to review. Everything Jev is told about Mondrian's taxonomy is
// here, and nothing about it lives anywhere else. Question IDs are for code only and
// are not sent to the model, so each question carries its full meaning in its text.
//
// The type list is deliberately wide (ADR 0013). Jev labels the corpus offline (ADR 0009),
// so the number of types costs nothing there beyond tokens; the point is to find out
// which distinctions a decision model can actually make on real pages, and to let block
// policy be as granular as the web's components are. Types that Jev cannot separate from
// their neighbours at useful confidence get merged after the corpus run, not before.
//
// Definitions are one sentence each and should not overlap: when two could both fit a
// region, the model spreads probability between them and the region gets flagged, which
// is the signal to sharpen or merge. Groups are comments only; the model sees one flat set.

'use strict';

const BLOCK_TYPES = {
  // ================================================================ the content itself
  title: 'The title of the page or article itself: the single main heading, usually the largest text and near the top.',
  heading: 'A section or subsection heading within the content: short, sets up what follows, not the page title.',
  summary: 'A standfirst, lede, abstract, deck, or TL;DR: a few sentences summarising the content, placed before the body.',
  text: 'Running prose the reader came to read: paragraphs of an article, an answer, a description, a story, documentation.',
  byline: 'Who wrote the main content and when: author name, publication date, updated date, reading time, source attribution. The header of a post inside a thread is part of comments.',
  author_bio: 'A box about the author placed after the content: photo, short biography, links to their other work.',
  metadata: 'Facts about the item shown as labelled values: tags, categories, prep time, servings, difficulty, version, licence, file size, word count.',
  badge: 'A small status label attached to content: new, updated, verified, beta, deprecated, widely available, editor\'s pick.',
  correction: 'A note from the publication that this article was corrected or amended after publication, saying what changed. Maintenance notices such as "needs more citations" are callout.',
  disclosure: 'A statement that the content contains affiliate links, was sponsored, or that the author has a conflict of interest.',
  content_warning: 'A notice that the content may be upsetting, explicit, or unsuitable for some readers, placed before it.',
  // ---- media
  image: 'A single still image or illustration that is part of the content, with or without a caption.',
  gallery: 'Several content images shown together as a set: a gallery, a slideshow of photos, a row of figures.',
  chart: 'A static chart, graph, diagram, or infographic that is part of the content, as an image or inline SVG.',
  video: 'A video player or embedded video that is part of the content.',
  audio: 'An audio player or podcast episode that is part of the content.',
  transcript: 'The written transcript of a video, podcast, or interview, usually with speaker names or timestamps.',
  // ---- structured content
  table: 'Tabular data: rows and columns of values, a comparison grid, a spec sheet, a timetable, a compatibility matrix.',
  list: 'A list that is content: bullet points, ingredients, features, a list of items without a fixed order.',
  steps: 'An ordered sequence of instructions the reader follows in order: method, procedure, tutorial steps, numbered directions.',
  definition_list: 'Terms paired with their definitions: a glossary, a parameter list, a list of fields with descriptions.',
  quote: 'A quotation set apart from the prose: a blockquote, a pull quote, an epigraph.',
  code: 'A code sample, terminal session, program output, configuration, or other preformatted text meant to be read literally, including a command shown together with its result.',
  math: 'A displayed mathematical formula or equation.',
  callout: 'A boxed note, tip, warning, important notice, or maintenance notice inside the content flow, set apart from the prose: "Note:", "Warning:", "This section needs more citations".',
  infobox: 'A summary panel of key facts about the subject, usually at the side or top: an encyclopedia infobox, a key-facts box, a recipe overview panel, a knowledge panel.',
  footnote: 'Footnotes or endnotes: numbered notes referred to from the text, shown at the bottom.',
  references: 'A bibliography, citation list, sources, or works cited: the list of things the content cites.',
  table_of_contents: 'A list of links to sections within this same page: "In this article", "Contents", "Jump to".',
  accordion: 'Collapsible sections the reader expands one at a time to reveal content: expandable headings, show/hide details, a FAQ built as expanders.',
  tabs: 'A strip of tabs or toggles that switch which part of the content is shown in place, without loading another page: Ingredients | Nutrition, Metric | US. Links to other pages are section_nav; links that jump within this page are table_of_contents.',
  // ---- interactive content
  embed: 'An interactive widget embedded in the content that runs as built: a live code sample, an interactive chart, a calculator, a social media post, a playground.',
  map: 'An interactive or static map showing a location or area as part of the content.',
  poll: 'A poll, survey, or quiz the reader answers, with results or a score.',
  calendar: 'Event details or a calendar: date, time, venue, add-to-calendar, schedule of sessions.',
  contact_details: 'An address, phone number, email address, opening hours, or a contact card for a person or organisation.',
  download: 'A link or button to download a file that is the content: a PDF, a dataset, an installer, an attachment.',
  // ---- discussion
  comments: 'User comments, replies, answers, or a discussion thread beneath or beside the main content, without a per-item star rating. Includes the header of each post: username, date, avatar.',
  reviews: 'User reviews of a product, recipe, place, or service, where each review carries its own star rating or score alongside the text.',
  rating: 'An aggregate rating or vote display: stars, score out of ten, number of ratings, upvote count, like count.',
  reactions: 'Emoji or one-click reactions on a piece of content: like, love, thumbs up, clap, and their counts.',
  vote_controls: 'Controls for the reader to vote on an item: upvote and downvote arrows, thumbs up and down, helpful yes/no.',
  user_card: 'A profile card for a user: avatar, name, handle, follower count, join date, bio, follow button.',
  // ================================================================ links to elsewhere
  related: 'Links to other content on the same site chosen for this page: related articles, see also, you might also like, related searches, more from this author, more in this series.',
  teaser_card: 'A repeated card or list item that previews another page: headline plus a summary, image, or timestamp, linking to the full item. The unit of news indexes, search results, product listings, and recipe collections.',
  product_card: 'A repeated card previewing a product for sale: image, name, price, rating, add-to-cart, linking to the product page. The unit of shop listings and search results in a store.',
  trending: 'A ranked list of what is popular on the site right now: most read, trending, top stories, hot topics.',
  tag_cloud: 'Topic tags or categories attached to this item for browsing the site by topic, shown as chips or a cloud. Related searches or related products belong to related.',
  pagination: 'Controls to move between pages of a listing or thread: page numbers, next, previous, load more, older, newer.',
  external_links: 'Links out to other websites presented as a list: official site, further reading elsewhere, download mirrors.',
  // ================================================================ things the reader operates
  form: 'A form the reader fills in and submits as part of using the content: sign up, comment box, contact form, settings, application.',
  login_form: 'A form to sign in or register: username, password, social sign-in buttons, forgot password.',
  search: 'A search box: site search, filter input, find within this section.',
  filters: 'Controls that narrow a listing: facets, checkboxes by brand or category, price range, date range, sort order, results count.',
  action_button: 'A button or small control that acts on the current item: save, print, download, play, copy, bookmark, follow, expand, read more.',
  buy_box: 'The purchase panel for a product: price, quantity, variants, add to cart or buy now, delivery estimate, stock status.',
  cart: 'The shopping cart or basket contents: items, quantities, subtotal, proceed to checkout.',
  checkout: 'A checkout or payment step: delivery address, payment method, order summary, place order.',
  pricing_table: 'Plans compared side by side with prices and features: free, pro, enterprise; monthly, yearly.',
  settings: 'Preferences the reader changes for themselves: theme toggle, font size, language, notifications, units, accessibility options.',
  // ================================================================ site furniture
  site_header: 'The site masthead: logo, site name, top bar, the strip at the very top that identifies the site.',
  site_nav: 'The site-wide navigation menu: main sections, primary menu, hamburger menu contents, a mega menu.',
  section_nav: 'Navigation within a section of the site: a sidebar tree of pages in the docs, a category submenu, chapter list, previous and next page.',
  breadcrumbs: 'The trail of links showing where this page sits in the site: Home > Recipes > Cakes.',
  version_switcher: 'A control to view this page in another version, edition, language, or platform: docs version picker, "also available in Welsh", "BBC in other languages".',
  page_tools: 'Tools that act on the page as an object rather than its content: edit, history, view source, print view, cite this page, report a problem, translate.',
  feedback: 'A prompt asking whether the page was helpful or how to improve it: thumbs up/down, "was this page useful", rate this page.',
  account: 'Sign-in link, profile, account menu, notifications bell, cart icon in the header: the reader\'s relationship with the site.',
  share: 'Buttons to share the page on social networks, copy the link, email it.',
  site_footer: 'The site-wide footer: about, contact, legal links, copyright, sitemap, social links at the bottom of every page.',
  legal_notice: 'Terms, disclaimer, privacy, compliance, or copyright text shown in the body of the page. Anything inside the site footer is site_footer, including its copyright line.',
  skip_link: 'Accessibility links such as skip to content, back to top, or jump to navigation.',
  site_notice: 'A site-wide announcement bar at the top: breaking news, maintenance, a sale, a new feature, a fundraising appeal.',
  // ---- interruptions
  cookie_banner: 'A cookie consent, privacy notice, or GDPR banner asking the reader to accept or manage tracking.',
  consent_gate: 'A placeholder where embedded content is withheld until the reader consents: "this content is hosted by a third party".',
  age_gate: 'A prompt asking the reader to confirm their age or region before seeing the content.',
  popup: 'A modal or overlay that interrupts the page and must be dismissed: an exit-intent popup, a welcome dialog, a survey prompt.',
  sticky_bar: 'A bar fixed to the top or bottom of the viewport that stays while scrolling: a persistent call to action, a reading progress bar with links, a mini player.',
  chat_widget: 'A customer support chat bubble, chatbot launcher, or live chat panel.',
  // ---- promotion
  ad: 'An advertisement: a display ad, an empty ad slot, or a shopping or product carousel labelled Ads or Sponsored, placed by a third party.',
  sponsored: 'Content presented like articles but paid for: sponsored posts, promoted stories, partner content, affiliate product picks.',
  newsletter: 'A prompt to subscribe to a newsletter or email list.',
  subscribe: 'A prompt to subscribe to, pay for, or upgrade the site itself: membership, premium, support us, donate.',
  paywall: 'A notice that the content is limited or hidden until the reader pays or logs in, including "you have N free articles left".',
  app_nag: 'A prompt to install or open the site\'s mobile app, or to enable push notifications.',
  cross_promo: 'Promotion of the site\'s own other products, events, or services: our podcast, our shop, our conference, sister sites.',
  // ================================================================ marketing and landing pages
  hero: 'The first block of a landing or product page, at the very top, above everything else: a headline, a subheading, a background image, and a primary call to action. Anything below the first screen is heading or summary, never hero.',
  feature_grid: 'A grid of features or benefits that describe the product on this page, each with an icon, a short title, and a sentence, and no link of its own. If each item links to its own page it is a teaser_card.',
  cta: 'A call-to-action block: a headline and a button asking the reader to sign up, get started, try free, or contact sales.',
  testimonial: 'Quotes from customers or users praising the product, with names, photos, or company logos.',
  logo_cloud: 'A row of customer, partner, or press logos: "trusted by", "as seen in".',
  stats: 'Big numbers as claims: users served, countries, uptime, years in business.',
  team: 'Cards for people: team members, speakers, contributors, authors on staff, each with a photo, name, and role.',
  // ================================================================ application and status
  toolbar: 'A row of tools or controls for operating an application: drawing tools, formatting buttons, canvas actions, a command bar.',
  canvas: 'The working surface of an application: a drawing canvas, a map viewport, a document editor, a spreadsheet grid, a game board.',
  status_message: 'A transient message about the system: success, error, loading, saved, offline, a toast or alert.',
  empty_state: 'A message shown where content would be but none exists yet: no results, nothing here, get started by adding one.',
  progress: 'A stepper or progress indicator showing where the reader is in a multi-step process: step 2 of 4, checkout stages.',
  // ================================================================ nothing
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

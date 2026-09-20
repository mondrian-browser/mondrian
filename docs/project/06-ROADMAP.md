# Roadmap

Lloyd's original list, and where each item lands now that `01-CONCEPT.md` exists.

**The concept absorbs most of this list.** Several things that were separate features —
selective blocking, dynamic reformatting, merging pages — stop being features and become
consequences of the design filter. That is a good sign for the concept and it means the
roadmap below should be read as "what the filter gives you for free" rather than a list of
things to build one at a time.

Build order implied by the concept, rather than by this list:

1. The block extractor and the ten types. This is the product; everything else is
   downstream of how good it is.
2. The block renderer and the layout language. Comparatively easy once the types are fixed.
3. The dropped-elements index and the per-site escape hatch, which are what make the
   filter trustworthy rather than lossy.
4. The block cache, which is what makes it feel instant rather than clever.
5. The bar, then drag-to-compose, then relayout in words.

---

## The original list

---

## Already in v1, and what the concept does to it

**Block content selectively.** Site rules do this today. Under the concept it stops being
a rule you write: content that is chrome, promotion or tracking simply gets no block. The
rules engine keeps a job, but it is correcting the classifier rather than hiding elements.

**Merge content selectively.** `page_create` does this today by framing sites side by
side. The concept replaces it with `compose://`: drag a tab onto a tab, Claude reads the
blocks and lays out one page, up to four sources, every block marked with where it came
from, conflicts kept rather than averaged, and split-back returning the originals
untouched. Composing from blocks rather than frames also removes the frame-header problem
entirely.

**Dynamically reformat page content.** The concept makes this the default rather than a
capability — every page is already reformatted into one layout language. Reformatting on
request becomes `/layout` and plain-language relayout of a composed page, which the
concept shows working live with per-block intent labels.

---

## Short steps from here

### Layouts — superseded
This was going to be a set of composed-page templates. The concept answers it better:
Claude picks the layout from what the blocks are, on drop, with no dialog, and you correct
it in words afterwards. Templates would have been a worse version of that. Do not build
them.

### Research → grid ("find me listings for this used book")
Largely a special case of composition now: open the results as tabs, compose them, and the
grid is what Claude lays out from the blocks. What remains specific to it is the
extraction of comparable fields across sites, which is the same problem the classifier
solves for tables.

Original note follows.

Composition of things that already exist: open N tabs in the `claude` profile, `page_read`
each, extract the fields, `page_create` a sortable grid linking back to sources. The work
is a reusable extraction helper and a grid template, not new browser machinery. Should be a
**skill** rather than a hardcoded feature, so the extraction prompt is editable when it gets
things wrong.

### Project hubs ("price estimate from a model site + a print service + materials")
The research-grid pattern with a second step: a composed page that keeps its own state
(a JSON sidecar in `pages/`) so it is a living document rather than a snapshot. Needs a
`page_state_set` / `page_state_get` pair of commands. Small.

### Captions
Real captions need a transcript. Three sources, in order of effort: the site's own caption
track (YouTube has one; scrape and restyle it), a local Whisper model via `device_bash`,
or nothing. Start with the first. Under the concept a transcript is naturally a block
beside the MEDIA block, which is a better home for it than an overlay.

---

## Needs deciding before building

### "Talk to Claude through the interface, not the API"

The browser can already be driven *by* Claude. The missing direction is the browser asking
Claude something, from a box in the UI. Three honest options:

1. **Local `claude` CLI, headless.** If Claude Code is installed on the machine, the browser
   shells out to `claude -p "<request>" --output-format json` with the page context attached.
   Uses the existing subscription sign-in, no separate API key, no extra billing. This is the
   closest thing to what was asked for. Requires Claude Code installed; response latency is
   seconds, not instant.
2. **A request queue the desktop session picks up.** The browser writes requests to a file;
   a running Claude session polls and answers. No new dependency, but only works while a
   session is open and watching, which is fiddly.
3. **API key.** Rejected — that is the thing being avoided.

Option 1 is the recommendation. It is maybe 150 lines plus a panel in the chrome.

### "Browse and act based on instructions given on that page"

Worth separating two readings:

- *Lloyd writes instructions on a page, Claude carries them out.* Fine. This is just a nicer
  input box, and option 1 above covers it.
- *A web page contains instructions and Claude follows them.* **This is the thing not to
  build.** Text on a fetched page is data, not instruction. A browser that obeys page
  content is a browser any site can hijack — and it is the same mechanism that would make
  stored credentials dangerous. The line stays: pages are read, Lloyd is obeyed.

### "Be secure af" / "work with everything"

These pull against each other and the honest version is a set of trade-offs, not a feature:

- Frame-header stripping is already scoped to composed pages, with the negative case tested.
  Widening it to "work with everything" is precisely what would make it unsafe.
- Chromium's own sandbox and site isolation are on. Keep them on.
- The control socket is loopback-only, token-authenticated, token regenerated per launch.
  The remaining weakness is that any local process can read `.runtime/control.json`. On a
  single-user machine that is an acceptable trade; worth knowing it is a trade.
- "Work with everything" mostly means the user-agent and sign-in flows. The UA is already
  cleaned of the Electron token. Some sites will still refuse a non-mainstream browser, and
  bank and Google sign-in flows will sometimes fail on purpose. That is not a bug to fix.

### Credentials — the part to push back on

Storing an email password and a debit card number so Claude can use them is the one item
on the list that should not be built as asked.

Not because of the storage. Encrypting secrets in Windows Credential Manager and filling
them without ever putting the value in a model's context is normal engineering, and is worth
building — call it `secret_fill({ name, ref })`, values never returned to Claude, password
fields redacted in `page_read`, console and network logs scrubbed. That part is a genuinely
good idea and is on the list.

The problem is the combination of *that* with *this browser*. Claude reads web pages, and web
pages are written by other people. Prompt injection — a page containing text crafted to
redirect an agent's behaviour — is an unsolved problem, not a hard one. An agent that can fill
a saved card is an agent that can be talked into filling it somewhere else, and neither of us
would see it happen until the statement arrived. The blast radius of a mistake is your bank
account rather than a messed-up tab.

So:

- **Passwords for accounts that exist for Claude's use** (a throwaway Gmail in the `claude`
  profile): fine, via `secret_fill`, once it exists. Low blast radius by construction.
- **Lloyd's real email password:** don't. Sign in yourself in the `lloyd` profile; the session
  persists and Claude never needs the password at all.
- **Card numbers:** no. Use a virtual card locked to one merchant if the bank offers one, and
  be at the keyboard for the payment step. A browser that cannot spend money is a browser that
  cannot be tricked into spending money, and that property is worth more than the convenience
  it costs.

The design rule that follows, and that everything above respects: **Claude may act with your
sessions, but never with your secrets.** Being signed in is revocable and visible. A handed-over
password is neither.

# Roadmap

Lloyd's list, sorted by what already works, what is a short step, and what needs an
argument before it gets built.

---

## Already in v1

**Block content selectively.** Site rules. Per-site request blocking, redirects, CSS
removal and JS injection, applied before first paint and again on SPA route changes.
`rules_set` writes one live.

**Merge content selectively.** `page_create` composes a page out of other pages, and
composed pages may frame sites that normally refuse framing. A tutorial beside a scrollable
manual is a dozen lines of HTML today. What is missing is not the capability but the
*ergonomics* — see Layouts below.

**Dynamically reformat page content.** Already possible via `rules_set` (permanent, per
site) or `eval_js` (one-off, this tab). Colour schemes, fonts, text layout, injecting a
feature that was not there. Captions are the one part that needs a transcript source.

---

## Short steps from here

### Layouts (makes "merge" pleasant instead of possible)
A small set of composed-page templates — split, triptych, grid, annotated — so that
"tutorial on the left, manual on the right, my notes underneath" is one command with three
URLs rather than hand-written HTML each time. Layouts keep per-pane state (scroll position,
video timestamp) in the page so the arrangement survives a reload.

### Research → grid ("find me listings for this used book")
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
or nothing. Start with the first.

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

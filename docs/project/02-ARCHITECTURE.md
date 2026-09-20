# Architecture

One pass through the whole system as it exists **today**. The code is the truth; this is
the map.

`01-CONCEPT.md` describes where it is going, which is a different browser: one where the
site's layout never reaches the screen. The last section here covers where the design
filter would sit in this structure and what it displaces.

## The shape of it

```
  Claude session
        │  MCP tools named mcp__remote-devices__mondrian__<command>
        ▼
  tools/mcp/server.js          stdio MCP server, registered as "mondrian".
        │                      One tool per entry in shared/commands.js.
        │                      Launches the app if it is not running; reconnects if it dies.
        │
        │  ws://127.0.0.1:6510   loopback only, token regenerated every launch
        ▼
  app/main/control.js          WebSocket control server inside the app
        │
        ▼
  app/main/handlers.js         every command implemented exactly once
        │                      the browser's own UI calls this same set over IPC
        ├── tabs.js            BaseWindow + one WebContentsView per tab
        ├── profiles.js        one Electron session partition per profile
        ├── rules.js           site rules; owns the single onBeforeRequest listener
        ├── adblock.js         EasyList/EasyPrivacy engine, consulted by rules.js
        └── main.js            boot, window, layout, shortcuts, context menus, IPC
        │
        ▼
  app/main/preload-page.js     runs in every page at document-start
                               applies rules before first paint; is the agent that
                               reads structure, resolves refs and drives input

  app/chrome/*                 the browser's own interface. Plain HTML/CSS/JS.
```

## The one rule that shapes everything

`shared/commands.js` is the single source of truth. A command is declared there with a
description and a zod schema, implemented in `handlers.js`, and it becomes an MCP tool
with no separate registration. The browser's own interface drives the browser through the
identical commands, over IPC instead of the socket. So anything the UI can do, Claude can
do, and vice versa — there is no second code path to keep in sync.

The description you write is what a future Claude reads to decide whether to call the
command. Write it for that reader.

## Window layout

`BaseWindow` with the chrome as a full-window `WebContentsView` underneath, and the
active tab's view stacked on top of it, covering everything below the toolbar. That is
why the chrome can have a right-hand panel: the page view is simply narrower when the
panel is open. It is also why `window.close()` does nothing in the chrome — it is a view,
not a window, so the window buttons go through the `window` command.

## Two worlds, and why it matters

Three places JavaScript can run, and they are not interchangeable:

- **The preload's isolated world.** Shares the DOM, not the page's globals. The page
  cannot see or tamper with it. This is where the agent lives.
- **Isolated world 1234.** Where a rule's `js` runs. Same isolation, but reached through
  `executeJavaScriptInIsolatedWorld`, which is not subject to the page's CSP. The preload's
  own world *is* subject to it for code generation, which is why `new Function` is useless
  there. See 03-GOTCHAS.md.
- **The page's own world.** Where a rule's `mainJs` and every filter-list scriptlet runs,
  before the page's scripts, once per document. Reached through
  `webFrame.executeJavaScript` from the preload.

## Request path

Every request goes through one `onBeforeRequest` listener in `rules.js`, in this order:

1. Site rules whose `match` covers the **top-level page** — redirects first, then blocks.
2. The ad and tracker engine.

Electron allows exactly one listener per event per session and a second silently replaces
the first, so there is one listener and `adblock.js` is a library it consults rather than
something that hooks the session itself.

## Rules

A rule set is one JSON file in `rules/`:

```json
{
  "title": "Clean YouTube",
  "enabled": true,
  "match":    ["*://*.youtube.com/*"],
  "block":    ["*://*.youtube.com/youtubei/v1/reel/*"],
  "redirect": [{ "from": "*://*.youtube.com/shorts/*", "to": "https://www.youtube.com/watch?v=$3" }],
  "css":      "ytd-reel-shelf-renderer { display: none !important }",
  "js":       "/* isolated world, re-runs on SPA route change */",
  "mainJs":   "/* page's own world, before its scripts, once per document */",
  "options":  { "killAutoplay": true }
}
```

`match` selects pages, not requests. `$1`, `$2`… in a redirect are the `*` wildcards of
`from`, in order. `js` receives `(options, reason)` and may `return` early. Files are
watched, so saving one applies it.

## Profiles

One Electron session partition each, so cookies, storage and cache are separate.
Verified isolated by the test suite, for cookies and for localStorage.

## Composed pages

`page_create` writes an HTML file into `pages/` and opens it. Those files, and only
those, may frame sites that send `X-Frame-Options` or `frame-ancestors`, because the
header stripping is scoped to subframes whose top-level document is one of them. The
test suite asserts both halves: a composed page may frame a DENY site, a normal page
still may not.

## Where the design filter would go

The concept's pipeline is **parse, classify, order, lay out**, in front of paint. Mapped
onto what exists:

```
  network                 rules.js + adblock.js       unchanged. Blocking a request is
                                                      cheaper than classifying what it
                                                      loaded, and it is about the network
                                                      rather than the layout.
        ▼
  document-start          preload-page.js             already runs before the page paints
                          │                           and already walks shadow DOM with
                          │                           stable refs, which is most of what
                          │                           a parser needs.
                          ▼
  PARSE + CLASSIFY        (new) block extractor       ten block types; anything that is
                          │                           chrome, promotion or tracking gets
                          │                           no block at all.
                          ▼
  ORDER + LAY OUT         (new) block renderer        the browser's own layout language.
                          │                           The site's CSS never reaches paint.
                          ▼
  CACHE                   (new) per-URL block store   second visit is instant; background
                                                      refetch when the source moved.
```

Two things this displaces, and one it does not:

- **Rule `css` stops being the main mechanism for removing things.** You do not hide a
  sidebar you never emitted a block for. Rules become per-site *correction* of the
  classifier: escape-hatch this site, force this element into a block, this selector is
  being misread. That is a better job for them.
- **`page_create` is superseded by `compose://`**, which composes from blocks rather than
  frames. That also removes the need for frame-header stripping, since nothing is framed.
- **Ad and tracker blocking is untouched**, and `page_read`'s shadow-DOM walk and ref
  system become the front end of the parser rather than only an agent affordance.

The hard part is the classifier, not the renderer. Ten block types across the real web is
the product; laying out ten known block types is a stylesheet. Plan effort accordingly.

## Where state lives

| what | where | survives restart |
|---|---|---|
| settings | `config/settings.json` | yes |
| site rules | `rules/*.json` | yes |
| themes | `themes/*.css`, plus `themes/custom.css` for `ui_css` persists | yes |
| composed pages | `pages/*.html` | yes |
| cookies and storage | `.runtime/userData/` per profile | yes |
| filter list engine | `.runtime/adblock-engine.bin` | yes, refreshed every 72h |
| control port and token | `.runtime/control.json` | no, written each launch |
| logs | `.runtime/logs/` | yes |
| block cache (planned) | per URL, `.runtime/` | yes, with background refetch |

`.runtime/` is gitignored. `control.json` existing means the browser is up and ready to
take commands — it is written last during boot for exactly that reason.

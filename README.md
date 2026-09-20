# Mondrian

A browser built from scratch so it can be steered deeply and changed quickly. Electron 44,
Chromium under the hood, every layer open: the interface is plain HTML you can restyle at
runtime, the network layer takes per-site rules, and pages can be composed out of other pages.

**Where it is going:** a design filter in front of paint, so no page is rendered as sent —
every document pulled apart into blocks and laid back out in one layout language, with
tabs as the unit you compose with. See `docs/project/01-CONCEPT.md` and
`docs/concept/concept-layout.pdf`. What is in this repo today is the foundation for that,
not the thing itself.

## Setup

```
cd ClaudeBrowser
npm install
npm start                 # run it
npm run install-mcp       # register it with the Claude desktop app, then fully quit and reopen Claude
npm test                  # 60 end-to-end checks against a real browser
```

The MCP server registers as **mondrian**, so its tools are named
`mcp__remote-devices__mondrian__<command>`. After `install-mcp`, any Claude session can
drive the browser and will start it automatically the first time it needs it.

## What it does

**Site rules.** `rules/*.json` decide, per site, what gets blocked, redirected, hidden or
injected. They apply before the page paints, and again when a single-page app changes route.
Edit a file and it reloads itself.

Bundled: **Clean YouTube** (no Shorts, no recommendations, no comments, no autoplay,
no end screens, and Shorts URLs redirected to the normal player), plus **Quiet web** and
**Focus mode** as off-by-default examples of hand-written rules.

**Ad and tracker blocking**, on by default, using EasyList and EasyPrivacy through the
Ghostery engine. Network blocking, element hiding and scriptlet injection, all applied
before the page paints.
The shield in the toolbar shows how many requests were stopped on the current page and
turns blocking off for a site in one click. Custom filters in Adblock Plus syntax go in
`config/settings.json` or through `adblock_set`. Lists are cached locally and refreshed
every three days.

**Profiles.** Separate cookie jars. `lloyd` for you, `claude` for accounts Claude uses,
any other name on demand. Verified isolated.

**Composed pages.** `page_create` writes a page into `pages/` and opens it. Those pages —
and only those — may embed sites that normally refuse to be embedded, so a tutorial can sit
beside a manual, or four shops' results in one grid.

**Themes.** `default` (warm dark), `paper` (light), and `destijl` — black rules, white
ground, the three primaries only where something is active, square corners. Themes are
token overrides on `:root`, so a new one is about fifteen lines.

**A UI that answers to code.** `ui_css` restyles the chrome live, `ui_eval` reprograms it,
`theme_set` swaps themes, `ui_note` posts into the activity panel so you can see what Claude
is up to without reading the chat.

## Keyboard

`Ctrl+T` new tab · `Ctrl+W` close · `Ctrl+L` address bar · `Ctrl+R` / `F5` reload ·
`Ctrl+Tab` next tab · `Ctrl+Shift+P` activity panel · `Ctrl+Shift+I` devtools

## Layout

```
app/main/      main process: window, tabs, profiles, rules, control server
app/chrome/    the browser's own interface (plain HTML/CSS/JS)
shared/        the command list — the one source of truth for what the browser can do
tools/mcp/     the MCP server Claude connects through
rules/         site rules
themes/        chrome themes
pages/         composed pages (output; gitignored)
tests/         e2e suite, plus YouTube A/B checks
```

`CLAUDE.md` is the working guide — read that before changing anything.

## Security notes

- The control server listens on `127.0.0.1` only, refuses non-loopback connections, and
  requires a token regenerated on every launch and written to `.runtime/` (gitignored).
- Pages run with context isolation on and node integration off.
- Frame-header stripping is scoped to subframes of composed pages and asserted in the test
  suite in both directions.
- Nothing here is a password manager. Type credentials yourself, in the profile you mean.

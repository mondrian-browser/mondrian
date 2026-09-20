# Mondrian

Mondrian is an experimental browser built so that AI (Claude, for now) can get right into the guts of your browsing and change it. The whole browser is open to it, not just a tab.

Imagine your top ten most visited websites merged into one page. Chaotic? Impossible? Not anymore.

The fact is, most of what's on a webpage is there for someone else. The nav bar, the share buttons, the "you might also like", the newsletter box: all necessary for a fraction of the userbase, dead weight for everyone else. If only the useful parts of each of your top ten sites were separated into distinct blocks and laid out in one style, you could do most of your daily browsing from a single tab. And because Claude plugs directly into the browser, every part of that tab is yours to change.

**One thing, upfront: you can't use this to break Claude's terms of service.** Adult sites, anything else Anthropic's usage policy rules out, leave them out of it. Mondrian gives Claude a lot of control, and pointing that at the wrong site is a fast way to lose your account. We can't protect you from that and we're not going to try.

Bad opsec? Not if it's done right, and doing it right is most of the work. The core runs with no model and no network. Nothing about what you browse leaves your machine. Claude's accounts live in their own profile and yours in another, and the plan (ADR 0012) keeps credentials and steering scoped per profile so Claude only touches what it's been given. The reasoning is all in `docs/adr/`.

## Where it's going

Every page goes through the design filter before it's painted. The filter breaks the page into blocks (a block for text, for a heading, for a video, for a table) and lays them out in Mondrian's own layout language. Every site ends up in the same grid.

Once you have blocks you can compose. Drag one tab into another and the two pages reflow into one. Claude decides the layout; if you want a different one, ask for it in the bar.

That's the aim: one layout system for the whole web, and a browser where the AI is part of the thing rather than bolted onto the side of it. `docs/project/01-CONCEPT.md` has the full picture and `docs/project/NEXT.md` has where we're up to. What's in this repo today is the foundation for that, not the thing itself.

## Setup

```
cd Mondrian
npm install
npm start                 # run it
npm run install-mcp       # register it with the Claude desktop app, then fully quit and reopen Claude
npm test                  # 93 end-to-end checks against a real browser
```

The MCP server registers as **mondrian**, so its tools are named
`mcp__mondrian__<command>`. After `install-mcp`, any Claude session can
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

**Profiles.** Separate cookie jars. `username` for you, `claude` for accounts Claude uses,
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
- Credentials are not stored yet. When they are (ADR 0012) they are per profile, encrypted
  at rest, and out of reach of the steering layer. Until then, type them yourself, in the
  profile you mean.

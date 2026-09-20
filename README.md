# Mondrian

Mondrian is an experimental browser with the aim of enabling AI (at this stage intended for use with Claude models) to deeply control and customise the user's browsing experience. 

Imagine your top ten most visited websites (with the exception of any "adult" content sites) are merged into one page. Chaotic? Impossible? Not anymore. 

The fact is, many UI elements are only necessary for a fraction of the userbase. Many parts of a website are completely unnecessary for many users. If only the useful parts of each of your top ten sites were separated into distinct "blocks", codified, and intelligently laid out in one style, we propose that you could quite easily complete all of your daily browsing from a single tab. Now imagine that every aspect of this tab is customisable because Claude plugs directly into your browser with a heretofore unseen level of deep control. 

Bad opsec? Maybe (if done poorly), but the payoff could be HUGE. With the necessary security measures in place, this could safely revolutionise the web browsing experience. 

## Some of the proposed features:

### Page composition:

every single webpage is first put through the design filter, which means that it fits into the layout language of the browser. The layout language is blocks - boxes for text, headings, videos, - every element has a block and they are arranged for maximum clarity for the reader. 

the processing of every page should be automatic and seamless, with a quick loading animation things should be loaded into this layout upon visiting any page. once the page has been loaded once, it will be instant to load it the second time. 

Then, you can drag two pages into each other and it will quickly reformat into the composed page. You can compose a maximum of four pages at a time . 

Composition is an automatic process driven by claude, the user doesn't need to select options, claude just makes the decision for them. As soon as you drag one tab into another it will happen. Alternatively you can then request a change to the page composition in the claude bar if you want some other layout.  

this way every website shares the same seamless design language and layout system.

#### The overall aim of Mondrian is to unify web design under one rule - the rule of the grid system. Too long has mankind been plagued by disparate formatting, urls, tabs - a web browsing experience hardly changed from last century. Mondrian aims to make the leap from traditional browsing to true AI-enabled web use; a browser experience for the twenty-first century. We know this is not an easy goal, but with the newfound technology that is rapidly evolving in front of us, we truly believe that it is an achievable one. 

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

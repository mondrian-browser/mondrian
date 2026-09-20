# Changelog

Notable changes. Format loosely follows Keep a Changelog. Nothing is released yet.

## Unreleased

### Added
- Electron shell with tabs, profiles as isolated cookie jars, and a control socket with
  an MCP bridge exposing 44 commands.
- Site rules: per-site request blocking, redirects, CSS and both isolated-world and
  main-world JavaScript, hot-reloaded from `rules/`.
- Ad and tracker blocking on EasyList and EasyPrivacy, with element hiding and scriptlet
  injection, and a toolbar shield showing per-page blocked counts.
- Composed pages: build one page from several live sites.
- Three test suites: 93 fixture checks, 20 live sites, and multi-step agent flows.
- `destijl` theme.

### Fixed
- Rule JavaScript never ran on any site whose CSP lacked `unsafe-eval`, which is most
  large sites. It now runs in a dedicated isolated world. See ADR 0003.
- Filter-list scriptlets broke YouTube completely when injected separately. They are now
  one bundle. See ADR 0004.
- `press_key` with Enter never submitted a form, because Chromium drives implicit
  submission from the char event.
- Element refs died whenever a site replaced a node. They now carry a descriptor and are
  found again.
- `page_text` read the wrong element on pages with a decoy landmark, and could not see
  shadow DOM at all, so web-component sites returned nothing.
- Frame-header stripping was silently disabled on Windows, because `file://` URLs were
  built by string concatenation.
- A start page that would not load stopped the browser booting at all. `loadURL` rejects
  on any main-frame failure and the rejection reached the boot handler's `app.exit(1)`,
  so offline, behind a captive portal, or with a bad `homeUrl` there was no window and no
  control socket. Boot now records the error on the tab and opens anyway.
- The fixture suite was not hermetic despite being documented as such: it booted to
  `settings.homeUrl` and so could not run without reaching duckduckgo.com. It now boots
  to its own fixture server.
- The test harnesses passed `--no-sandbox` and `--disable-gpu` only when running as
  root, so on any other Linux machine Chromium aborted before boot with the SUID
  sandbox error, and screenshots failed with `UnknownVizError` once it did boot. CI had
  been red on `main` for nine consecutive runs because of it. Both flags are about
  headless Linux rather than root, and all three harnesses now pass them on Linux
  unconditionally. See gotcha 8.

### Changed
- Renamed from Claude Browser to Mondrian. The MCP server registers as `mondrian`.

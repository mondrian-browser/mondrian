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
- Three test suites: 86 fixture checks, 20 live sites, and multi-step agent flows.
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

### Changed
- Renamed from Claude Browser to Mondrian. The MCP server registers as `mondrian`.

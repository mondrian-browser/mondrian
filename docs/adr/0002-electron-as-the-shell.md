# 0002. Electron as the shell

Date: 2026-09-19
Status: accepted

## Context

Mondrian needs four things from whatever it is built on:

1. Script execution at document-start, before the page's own scripts, so the design
   filter can run in front of paint rather than after it.
2. Network request interception, for blocking and redirecting.
3. Script execution in an isolated world that the page cannot see and that is not subject
   to the page's content security policy.
4. Several independent cookie jars in one application, for profiles.

Alternatives considered:

**Tauri** with the system webview. Smaller binaries and a Rust core, but WebView2 and
WebKitGTK expose far less of the page. Document-start injection, request interception and
isolated worlds are either unavailable or inconsistent between platforms. It would mean
rebuilding the parts of the browser that Mondrian most depends on.

**Chromium Embedded Framework** directly. More control than Electron, considerably more
work, and the same Chromium update obligation.

**A browser extension** instead of a browser. Content scripts at `document_start` and
`declarativeNetRequest` cover a surprising amount of the design filter, distribution is
free through the stores, and there is no Chromium treadmill. But the tab strip, the
address bar and the window are not the extension's to change, so drag-to-compose, the
six-state bar and `compose://` are all impossible. It would be a different product.

**Forking Chromium**, as Brave and Arc do. The right answer for a serious browser company
and out of reach for one person.

## Decision

Electron. All four requirements are met by documented APIs, and each has been verified by
measurement rather than assumed (see ADR 0003 and `04-GOTCHAS.md`).

## Consequences

Bundle size is roughly 150MB and Chromium security updates become a standing obligation,
roughly every eight weeks.

That obligation exists for any Chromium-based approach and is worse when embedding CEF
directly, so it is a cost of the category rather than of Electron.

Shipping closed source would have carried an LGPL relinking obligation from the bundled
FFmpeg. ADR 0007 makes that moot.

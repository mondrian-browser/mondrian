# Log

Append-only. One entry per run that did something. Idle runs write nothing.
Format is in `ROLES.md`. Newest at the bottom.

---

## 2026-09-20 setup (Lloyd, with Claude in Cowork)
Did: cloned mondrian.bundle to the Mondrian repo (NEXT A1), npm install and the fixture
suite on Windows, 86 passed (A3). Renamed the branch to main to match CI. Wrote company/.
Found: .mcp.json pointed at the old ClaudeBrowser folder; fixed. package-lock changed on
Windows install; committed.
Later the same day: published to github.com/mondrian-browser/mondrian (A4). Rewrote the
loop prompts for Claude Code routines: repo attached, no token, claude/ branches, PR and
release events as triggers.
Next: connect GitHub at claude.ai/code, install the Claude GitHub App on the repo, create
the four routines from company/loops/.
Tags: [needs-ops]

## 2026-09-20 marketing
Did: wrote company/marketing/positioning.md (trigger: the file did not exist yet), one
page derived only from docs/PRD.md. Who it is for, the problem in their words, what
Mondrian does, the non-goals as a selling point, and the one sentence. Flagged the
measurable gates and the application-coverage risk as unverified, per the PRD's own
status.
Found: no release yet, no CHANGELOG entry, no marketing-tagged DECISIONS entry, so
release notes, the landing page draft and the name decision (C3) stay untouched this run.
Next: name.md still needs to be started against the Headstart collisions once there is a
DECISIONS answer to track (D2 is still open); landing page draft once there is something
to download.
Tags: none

## 2026-09-20 setup (Lloyd, with Claude in Cowork), evening
Did: PRD revised on Lloyd's direction. Mondrian is a complete browser: three rendering
tiers (relayout, skinned, contained) replace the raw escape hatch, ADR 0011; credentials
are stored per profile and steering is scoped per profile (drive, read, off), ADR 0012.
Threat model added to the PRD. CONTRIBUTING, README, SECURITY, CONCEPT and NEXT updated
to match. Four routines created and set to Opus 5. D2 marked later.
Found: marketing's first positioning.md correctly followed the old PRD and now needs
regenerating against the new non-goals and the threat model.
Next: marketing rewrites positioning.md from the revised PRD. Design reads ADR 0011 and
notes what the skinned tier's base stylesheet needs from the theme tokens.
Tags: [needs-marketing] [needs-design]

## 2026-09-20 engineering
Did: fixed the fixture suite failing on main, opened PR #1. The suite died before a
single check in the routine's container with "browser never wrote control.json". Root
cause was a product bug, not test plumbing: webContents.loadURL rejects on any main-frame
navigation failure, boot() awaited the start-page tab_open without catching, and the
rejection reached the boot catch and called app.exit(1). Offline, behind a captive
portal, behind a proxy that refuses CONNECT, or with a typo in homeUrl, Mondrian would
not start at all — no window, no control socket, no omnibox to type a working URL into.
Boot now records the failure on the tab (Chromium paints its own error page, did-fail-load
sets tab.lastError) and opens anyway; control.start() still runs last so control.json
keeps meaning "ready for commands". The suite also boots to its own fixture server now
instead of settings.homeUrl. Six new checks with the negative case; 92 passed, 0 failed
in 25 s with no network, twice. Reverting only the main.js change turns the new check red,
so the test fails without the fix. Gotcha 12 written up, counts 86 -> 92 across the docs,
CHANGELOG entry.
Then CI on the PR showed the trigger had three causes, not one, and the other two had
been hiding in plain sight. Second: --no-sandbox was passed only when getuid() === 0, so
on any non-root Linux box Chromium aborted before boot with the SUID sandbox error. It
has to be argv because appendSwitch runs after the SUID check, so main.js's own Linux
no-sandbox line never took effect. Third, once that was fixed the browser booted and
failed on screenshot with UnknownVizError and on a click that missed: --disable-gpu was
keyed on the same wrong guard. Both flags describe headless Linux, not root; all three
harnesses now pass both unconditionally on Linux. PR #1 is green on Linux and Windows,
mergeable_state clean, waiting on Lloyd. Five commits, 93 checks.
Found: four things. (1) **CI has been red on main for nine consecutive runs**, 17 through
25, and nobody noticed: only the Linux job was failing, Windows was green, and the suite
passed on every machine anyone ran by hand. This PR is the first green Linux run the repo
has had. Worth a habit of checking the Actions tab, not just the local run. (2) The guard
that caused it, asRoot, encoded *where* the bug was first found rather than *what* it was
— the shape of mistake to watch for. (3) The live suites (site-suite.js, agent-suite.js)
launch the same way with no --url=, so the boot bug stopped them too; after the fix
npm run test:sites reaches its own reporting. (4) This container cannot reach any of the
20 live sites (proxy blocks them all: 0/0 tested, 20 skipped), so no cloud run can give
real-IP evidence; that has to come from Lloyd's machine.
Next: nothing in NEXT.md is ticked by this — it came from the fixture-suite trigger, not
a NEXT item. The unchecked work is B6.5's next corpus growth batch (needs network and a
dollar of Jev, so probably not from this container) and C1, the control socket, which is
the largest unblocked engineering item and is pure local work. C1 next run unless a PR
event fires. Lloyd's twenty own sites are still the missing input for B6.5.
Tags: none

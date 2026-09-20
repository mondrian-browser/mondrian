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

## 2026-09-20 design
Did: first design run. Trigger was the [needs-design] tag on the evening setup entry,
which asked design to read ADR 0011 and say what the skinned tier's base stylesheet will
need from the theme tokens. Note in company/design/2026-09-20-skinned-tier-tokens.md.
The tier framing itself holds and is the right shape: a page that keeps its own layout
but arrives in Mondrian's type and colour is a far better answer than an escape hatch,
and because it rides the document-start CSS channel the filter still sits in front of
paint in all three tiers, which is the one rule from section 8b a skinning tier could
easily have broken.
Found: four token gaps, three of them milestone 2 work and one fixable today.
(1) The theme files are not self-sufficient. default.css declares eleven tokens and paper
omits the radii and the fonts; both work only because chrome.css is always loaded first
and carries the defaults. A skinned-tier stylesheet is injected into a site's document
where chrome.css does not exist, so under default and paper a skinned site would arrive
with no radius and no font defined at all. Either every theme declares the full set or
the base stylesheet duplicates the palette, and a duplicate will drift within a month.
(2) Nothing says whether a theme is light or dark. color-scheme appears nowhere in the
repo. Skinning an arbitrary site means telling its UA the scheme before first paint or
its form controls, scrollbars and canvas keep rendering to the UA default. Needs a token,
something as plain as --scheme: dark, in every theme file.
(3) The palette is a chrome palette, not a document palette: no link, visited, selection,
focus, code, table or highlight colour. A base stylesheet's only honest answer today is
--accent for all of them, which under destijl puts de Stijl red across every paragraph
with two links in it and stops the red meaning "active" anywhere else. Same for type:
--font and --mono are families only, with no size, scale or measure, while the concept
asks tier 1 for text at a fixed measure. If the tiers each invent one, the same site
looks like two different browsers depending on which tier it landed in.
(4) Fixable today, and the warning the other three should be read against: the chrome
does not honour its own corner token. chrome.css used --radius in four places and wrote a
literal in fifteen others, so destijl's --radius: 0px did nothing. The theme said square
and the browser rendered a 16px omnibox pill and 8px tab corners. PR #2, labelled design:
three new tokens (--radius-pill, --radius-tab, --radius-xs), ten literals moved onto
them, destijl declares all three as 0px. The spinner, the rules dot, the switch and the
2px bar under the active tab stay round on purpose; whether de Stijl allows a round
indicator is a question for Lloyd, not a token change to sweep in.
Measured with a throwaway Electron harness that loads the real chrome document, injects
each real theme and reads computed radius back: destijl goes to 0px throughout, default
and paper keep the omnibox, tab, tab pill and icon buttons unchanged with five chips
moving one pixel. npm test cannot run against main in a cloud container yet because it
hits the boot failure PR #1 fixes, so the two files were moved onto PR #1's branch and
the suite run there: 93 passed, 0 failed. No check asserts a corner radius, which is part
of why this survived.
Next: gaps 1 to 3 are milestone 2 and NEXT says do not start it early, so they are not
work for now. They should be settled as part of that milestone rather than guessed at
when the base stylesheet is first written, and B1 recording a tier per corpus page is
where a light-or-dark token would first be useful. Nothing else fires for design until
the chrome changes or the concept does.
Tags: [needs-engineering]

## 2026-09-20 marketing, evening
Did: rewrote company/marketing/positioning.md against the revised PRD (trigger: the
[needs-marketing] tag on Lloyd's evening entry). Rewrite rather than patch, because the
two things the first version leaned on hardest are now false: it said Mondrian was not a
Chrome replacement and that it never stored credentials, and the PRD now says it is a
complete browser with three rendering tiers and that credentials are stored per profile
and kept away from the steering layer. The new page adds the tiers as the reason Mondrian
is a browser rather than a reading mode, adds the profile boundary as a describable shape
rather than a promise, replaces the old "not a Chrome replacement" non-goal with "not a
site faithful browser", and turns the threat model's residual risk into something the
public description is required to state rather than something marketing manages.
Found: two things worth holding to. The old positioning was not wrong when written, which
is the argument for regenerating from the PRD on every revision rather than editing the
page in place; a patched version would have kept "not a credential manager" as a selling
point while the product stored credentials. And the PRD's honesty is the most usable
material in it: the unmeasured gates, the coverage risk and the accepted prompt injection
risk read better stated plainly than hedged, so they are a section of the positioning
instead of a caveat at the bottom. The only number on the page is Brave SpeedReader's
22%, taken from the PRD's prior art note and labelled as not Mondrian's.
Next: name.md (C3) is still unstarted and still has nothing to track, since D2 is answered
"later" and no Headstart search has been run. It needs a decision from Lloyd or a name
change before it is worth writing, so it is not blocked on marketing. Landing page draft
waits on something to download. Nothing else fires until a release, a [needs-marketing]
tag, a marketing tagged DECISIONS answer, or the first of October.
Tags: none

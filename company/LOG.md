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

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

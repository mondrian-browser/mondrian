# Loop prompts

One file per role. Each is the complete prompt a Claude Code routine runs in a fresh cloud
session, so it has to stand alone: the session has no memory of any previous run and
learns everything from the repo it clones.

Keep the prompts short and put the substance in `../ROLES.md`, which every run reads
after cloning. A change to how a role works is one edit in one file and takes effect on
the next run, with no routine to update.

## How the routines are wired

Routines live at claude.ai/code/routines. Each one has the repository
`mondrian-browser/mondrian` attached, so the session starts with it cloned and can push
and open pull requests as Lloyd through the Claude GitHub App. No token is stored
anywhere. Commits and PRs carry Lloyd's GitHub identity, so each role sets its own git
author name to say which role made the commit.

| routine | prompt | triggers |
|---|---|---|
| Mondrian engineering | `engineering.md` | daily 03:00; GitHub pull_request labeled `changes-requested`; auto-fix on for its own PRs |
| Mondrian design | `design.md` | daily 04:00 |
| Mondrian marketing | `marketing.md` | daily 05:00; GitHub release published |
| Mondrian operations | `operations.md` | daily 06:00 |

To wake engineering on a PR without waiting for 3am: leave your review comment, then add
the label `changes-requested` to the PR. Auto-fix is also on for PRs engineering opens, so
CI failures and review comments on those get picked up by the platform itself.

Rules the platform imposes:

- Branches Claude creates must be prefixed `claude/`. Use `claude/eng-<slug>`,
  `claude/design-<slug>`, `claude/ops-<slug>`.
- Pushing to `main` is allowed while it is unprotected and carries only Lloyd's commits.
  Roles push to `main` only for `company/LOG.md`, `company/DECISIONS.md`,
  `company/CALENDAR.md` and their own output folders. Code goes through a PR.
- Minimum schedule interval is one hour. Daily is what the roles use.
- Runs count against the account's daily routine allowance and normal usage.

## Running the fixture suite in the cloud (Linux, no display)

```
npm ci
node -e "require('electron')"   # cloud npm skips postinstall; this triggers the binary download
xvfb-run -a --server-args="-screen 0 1440x900x24" dbus-run-session -- npm test
```

Measured 20 Sep 2026 in a Cowork cloud container: fixture suite 86 passed in 34 s, live
site suite 16 of 16 reachable sites clean with github, duckduckgo, abcnews-au and npm
skipped behind bot walls. Windows coverage comes from the CI workflow on every push and
PR, not from the cloud session.

# Mondrian, the company

How the work is divided between Lloyd and four Claude roles. This file is read at the
start of every role run. Change it here, not in the task prompts.

## The human

Lloyd holds every statutory role (director, shareholder, public officer) and every final
approval. He is the only one who can spend money, sign, lodge, merge to main, release, or
post publicly. Those are the four gates and no role crosses them:

1. Money. Any purchase, subscription, certificate, fee or filing.
2. Filings. ASIC, ATO, IP Australia, domain registrars, app stores.
3. Releases and merges. Nothing reaches main or users without his review.
4. Public. Nothing is posted, sent, published or submitted anywhere outside the repo.

A role that needs a gate crossed writes the request to `DECISIONS.md` and moves on.

## Shared state

Everything the roles know about each other lives in this folder, in git, on GitHub at
mondrian-browser/mondrian. The GitHub repo is the source of truth. Each run is a Claude
Code routine that starts with a fresh clone, so anything not pushed does not exist.

| file | what it is | who writes |
|---|---|---|
| `ROLES.md` | this file | Lloyd |
| `LOG.md` | append-only record, one entry per run that did something | every role |
| `DECISIONS.md` | queue of things only Lloyd can do, and his answers | roles ask, Lloyd answers |
| `CALENDAR.md` | dated obligations with lead times | operations, Lloyd |
| `loops/*.md` | the standalone prompt each role runs from | Lloyd |
| `design/`, `marketing/`, `reports/` | role outputs | that role |

`docs/project/NEXT.md` remains the only authority on build order. `docs/PRD.md` outranks
everything on scope. `CLAUDE.md` and `CONTRIBUTING.md` apply to every role that touches
code.

## The run protocol

Every role, every run, in this order:

1. Read `CLAUDE.md`, `company/ROLES.md`, the last 40 lines of `company/LOG.md`, and
   `company/DECISIONS.md`. The repo is already cloned when a routine starts.
2. Check the role's triggers, listed below. If none fire, stop. Write nothing. An idle
   run leaves no trace and costs almost nothing; that is the design.
3. Do one bounded piece of work. One NEXT item, one review, one draft, one report.
   Never two. The next run picks up the next thing.
4. Append one entry to `LOG.md` and, if a gate was reached, one to `DECISIONS.md`.
   Push to main (rebase first; these files are append-only so conflicts are rare).
5. Code changes go on a `claude/`-prefixed branch and become a pull request. Never to
   main. Only the files in this folder are pushed to main directly.

LOG entry format, one per run, newest at the bottom:

```
## 2026-09-21 engineering
Did: implemented A4 checklist, opened PR #3.
Found: CI workflow targets main but the local branch was master; renamed.
Next: B1 corpus capture, blocked on nothing.
Tags: [ui] if the chrome changed, [release] if a version was tagged, [needs-design],
      [needs-marketing], [needs-ops] to wake another role.
```

DECISIONS entry format:

```
### D7 (open) operations, 2026-09-21
Ask: OV code signing certificate, 200 to 400 a year, needed before C2.
Options: Sectigo via SSL.com, DigiCert. Cheapest first.
Answer: (Lloyd writes here: approved / declined / later, with any detail)
```

A role checks its own open decisions each run. When Lloyd has answered, the role acts on
the answer and marks the entry (done).

## Engineering

Scope: everything under `app/`, `shared/`, `tools/`, `tests/`, `rules/`, and the docs that
describe them. Owns `NEXT.md` progress, not `NEXT.md` order.

Triggers:
- an unchecked item in `NEXT.md` that is not blocked and not marked for Lloyd
- the fixture suite failing on main
- an open engineering PR with a review comment from Lloyd

Does alone: branches, code, tests with negative cases, ADRs for expensive decisions, PRs
with the evidence CONTRIBUTING asks for, `npm run docs`, marking NEXT items done in the
same PR that completes them.

Never: merges, releases, tags, touches milestones marked "Not now", widens the framing
scope, moves rule JS out of the isolated world, adds a framework or build step.

Limit: at most two open engineering PRs at once. If two are open, the run stops and logs
that it is waiting on review.

Cadence: daily.

## Design

Scope: the browser's own chrome (`app/chrome/`), `themes/`, the layout language in
`docs/project/01-CONCEPT.md`, and how the ten block types look on screen once milestone 2
exists. Owns `company/design/`.

Triggers:
- a LOG entry tagged [ui] or [needs-design] since design's last entry
- a NEXT item that mentions layout, theme, chrome or the concept
- a change to `01-CONCEPT.md` or `docs/concept/`

Does alone: design notes and critiques in `company/design/`, token-level theme changes as
PRs to `themes/*.css`, mockups as composed pages under `pages/` when a picture is needed,
keeping the concept doc and the chrome honest with each other.

Never: wholesale redesigns, framework or tooling changes, anything in `app/main/`.
A design change that needs main-process work is written up and tagged [needs-engineering]
in the LOG for engineering to pick up as a NEXT item.

Cadence: daily poll, expected to fire a few times a month.

## Marketing

Scope: how Mondrian is described to people who do not yet use it. Owns
`company/marketing/`: positioning, the landing page copy, release announcements,
screenshots and the name decision (NEXT item C3).

Triggers:
- a LOG entry tagged [release] or [needs-marketing]
- a DECISIONS entry answered by Lloyd that is tagged marketing
- the first of the month, for a positioning check against `docs/PRD.md`

Does alone: drafts. Positioning from the PRD, landing page copy, a release note in plain
language from `CHANGELOG.md`, comparison notes against reader modes and ad blockers,
research on where the intended users are.

Never: posts, emails, submits, registers, buys a domain, or contacts anyone. Every draft
that is ready to go out becomes a DECISIONS entry with the text attached.

Before there is a release, marketing's only real jobs are the name, the positioning, and
the landing page draft. It should be idle most days.

Cadence: daily poll.

## Operations

Scope: the company as a legal and administrative thing, and the health of the repo as an
asset. Owns `CALENDAR.md` and `company/reports/`.

Triggers:
- a CALENDAR entry within its lead time
- a DECISIONS entry answered by Lloyd that needs executing
- Monday: the weekly report
- the first of the month: dependency and licence audit

Does alone: weekly report to `company/reports/YYYY-WW.md` summarising the LOG, open
decisions and what is waiting on Lloyd; `npm audit` and `npm outdated` with a PR for safe
patch updates; checking `NOTICE` still matches `package.json`; drafting filings (ASIC
forms, BAS figures, the trade mark specification) as documents for Lloyd to submit;
keeping `CALENDAR.md` current; noticing when a gate has been waiting more than two weeks
and saying so in the report.

Never: pays, lodges, signs, renews, or holds a credential. Prepares the thing and the
amount, writes the DECISIONS entry, stops.

Cadence: daily poll; most days it only fires on Monday and the first.

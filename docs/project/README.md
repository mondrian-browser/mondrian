# Project knowledge bundle

Upload these to the Claude Project as knowledge, and paste the block inside
`00-INSTRUCTIONS.md` into the Project's custom instructions box.

| file | what it is | upload? |
|---|---|---|
| `00-INSTRUCTIONS.md` | the custom-instructions text, plus notes on why it says what it does | paste the block, uploading is optional |
| `01-CONCEPT.md` | the design filter and composition — what this is becoming | yes, first |
| `02-ARCHITECTURE.md` | the system as built, and where the filter would sit | yes |
| `03-COMMANDS.md` | all 44 commands, generated from source | yes |
| `04-GOTCHAS.md` | the expensive knowledge — read this one | yes |
| `05-STATUS.md` | what is built, what is verified, and the gap to the concept | yes |
| `06-ROADMAP.md` | the original list, and what the concept absorbs | yes |
| `07-OVERNIGHT.md` | the night the six bugs were found; useful as worked examples | optional |
| `08-DEVELOPMENT-PLAN.md` | decisions taken, order of work, and what would make it fail | yes |

Also upload `docs/concept/concept-layout.pdf`. It is the visual reference and `01-CONCEPT.md`
is deliberately written to work without it, but the pages carry detail that prose does not.

`03-COMMANDS.md` is generated. Run `npm run docs` after changing `shared/commands.js`
and re-upload it, or it will drift from the browser.

## Where the rest of the project documentation lives

This bundle is for Claude sessions. The repository also carries the documents a
contributor expects, and they are the authority for anything they cover:

| file | what it is |
|---|---|
| `docs/PRD.md` | the guiding document: goals, non-goals, success criteria, risks |
| `docs/adr/` | architecture decision records, one per decision worth not rediscovering |
| `CONTRIBUTING.md` | the standard of evidence, how to test, what is not negotiable |
| `SECURITY.md` | known exposure, stated plainly, including the control socket |
| `CHANGELOG.md` | what changed |

`docs/PRD.md` outranks everything in this bundle on questions of scope. If they disagree,
the PRD is right and the bundle needs updating.

## What to keep current

`05-STATUS.md` goes stale fastest and is the most misleading when it does. Update it when
a suite count changes, when something moves from unverified to verified, when a rough edge
is fixed, and as rows in the concept table move off "not started".

`04-GOTCHAS.md` should only ever grow. If a night is lost to something, it belongs here
before the fix is committed.

`01-CONCEPT.md` should stay a description of the design, not a progress report. Progress
belongs in status. If the design itself changes, change it here and say what changed.

The repo's `CLAUDE.md` stays the working guide for sessions that have the code in front
of them. This bundle is for sessions that do not — it carries what is expensive to
rediscover, not a copy of the source.

## A note on drift

These documents describe a codebase that will keep moving. Where they disagree with the
code, the code is right. Every one of them says so, and a session should be told to check
rather than trust — the failure mode for project knowledge is confident staleness.

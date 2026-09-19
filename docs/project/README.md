# Project knowledge bundle

Upload these to the Claude Project as knowledge, and paste the block inside
`00-INSTRUCTIONS.md` into the Project's custom instructions box.

| file | what it is | upload? |
|---|---|---|
| `00-INSTRUCTIONS.md` | the custom-instructions text, plus notes on why it says what it does | paste the block, uploading is optional |
| `01-ARCHITECTURE.md` | the whole system in one read | yes |
| `02-COMMANDS.md` | all 44 commands, generated from source | yes |
| `03-GOTCHAS.md` | the expensive knowledge — read this one | yes |
| `04-STATUS.md` | what is verified, what is not, as of today | yes |
| `05-ROADMAP.md` | the eight things Lloyd asked for, and where each stands | yes |
| `06-OVERNIGHT.md` | the night the six bugs were found; useful as worked examples | optional |

`02-COMMANDS.md` is generated. Run `npm run docs` after changing `shared/commands.js`
and re-upload it, or it will drift from the browser.

## What to keep current

`04-STATUS.md` goes stale fastest and is the most misleading when it does. Update it when
a suite count changes, when something moves from unverified to verified, or when a rough
edge is fixed.

`03-GOTCHAS.md` should only ever grow. If a night is lost to something, it belongs here
before the fix is committed.

The repo's `CLAUDE.md` stays the working guide for sessions that have the code in front
of them. This bundle is for sessions that do not — it carries what is expensive to
rediscover, not a copy of the source.

## A note on drift

These documents describe a codebase that will keep moving. Where they disagree with the
code, the code is right. Every one of them says so, and a session should be told to check
rather than trust — the failure mode for project knowledge is confident staleness.

# Contributing

Mondrian is Apache-2.0 and contributions are welcome. This document is short on purpose.

## Before you write code

Read `docs/PRD.md` for what Mondrian is trying to be, and `docs/project/04-GOTCHAS.md`
before touching the preload, the rules engine or input handling. Six of the bugs found so
far were invisible failures where a feature looked fine while half of it had never run.
They are all written down.

For anything that would be expensive to reverse, write an architecture decision record in
`docs/adr/` as part of the change rather than after it.

## The standard of evidence

**Measure, do not assume.** Every real fix in this project came from writing a throwaway
Electron harness and finding out what the browser actually does. Guesses about Chromium
behaviour have been wrong more often than right here.

If a change rests on a claim about how Electron or Chromium behaves, the pull request
should say how that was verified.

## Tests

```
npm test              # 86 fixture checks, hermetic and fast
npm run test:sites    # 20 live sites, needs network
npm run test:agent    # multi-step flows on live sites
```

Run all three before opening a pull request. CI runs the first on every push.

Fixtures pass because they were built to. Every bug worth fixing so far came from the
live suites, so a change that only adds fixture coverage has probably not been tested.

New behaviour needs a regression test **with its negative case**. A test that only proves
the feature works is half a test: the framing tests assert both that a composed page may
frame a site sending `X-Frame-Options: DENY` and that a normal page still may not.

Assertions should wait for a condition rather than sleeping a fixed duration. A fixed
sleep against a throttled event is how the shield tests came to fail one run in three.

## Style

CommonJS, Node built-ins, no build step, no framework. The point of this codebase is that
any part of it can be read and changed in one sitting.

Errors are instructions. `No tab "t7". Open one with tab_open.` rather than `No tab "t7".`

Commands are declared in `shared/commands.js` and implemented in `app/main/handlers.js`.
The description you write is what a future Claude reads to decide whether to call the
command, so write it for that reader. Run `npm run docs` afterwards.

## Things that are not up for negotiation

These are design positions, recorded in `docs/adr/` and in the PRD's non-goals.

- Nothing is silently deleted. Whatever the filter drops is counted and listed.
- Sources are never thrown away, and blocks that contradict each other are kept side by
  side rather than averaged into one claim.
- Stored credentials never cross the steering boundary. The control socket, the preload
  and rule JavaScript have no path to them, and a profile set to `off` is invisible to
  Claude. ADR 0012.
- Page content is data, never instruction. A browser that obeys the pages it reads is one
  any site can steer.

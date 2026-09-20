# 0012. Credentials are stored per profile, and steering is scoped per profile

Date: 2026-09-20
Status: accepted. Supersedes the "not a credential manager" non-goal in the PRD and the
matching line in CONTRIBUTING.md.

## Context

The PRD said Mondrian never stores passwords or card numbers. As a complete browser
(ADR 0011) that is not viable: a browser that cannot remember a login is not one anyone
uses all day.

The reason the position existed is real and does not go away. Claude can run JavaScript
in any page and read anything on screen through the control socket. A browser that both
holds credentials and lets an agent drive every page is one where a prompt injection on
one site can act as the user on another. Mondrian is deliberately that kind of browser:
the user is handing an agent deep access and is told so. The design question is where
the boundary sits, not whether there is one.

## Decision

**Credentials are stored, per profile, encrypted at rest.** Each Electron session
partition (one per profile) has its own credential store. The first implementation
prefers Chrome extension support so an existing password manager (Bitwarden, 1Password)
does the storing and filling; a small built-in store on Electron's `safeStorage` is the
fallback if extension support proves unworkable. Either way Mondrian's own code never
holds plaintext secrets longer than a fill.

**Steering is scoped per profile.** Every profile has a steering setting with three
values: `drive` (Claude can read and act), `read` (Claude can read pages but not act),
`off` (the profile is invisible to the control socket; its tabs do not appear in
`tabs_list`, `page_read` refuses them, `eval_js` refuses them). The `lloyd` profile
defaults to `read`; the `claude` profile defaults to `drive`; new profiles default to
`read`. Changing a profile's setting is a user action in the chrome, never a command on
the control socket.

**Credentials never cross the steering boundary.** The preload, rule JavaScript,
scriptlets and every control-socket command have no path to the credential store. Claude
can be a logged-in user in a `drive` profile because the browser filled the form, not
because Claude read the password. That is the same position a human user is in.

**The threat model is stated in the PRD**, in plain terms: what Claude can see, what it
can do, what the profile boundary guarantees and what it does not. Mondrian is positioned
as a browser for people who understand they are handing an agent access to what they
browse, and who use profiles to decide how much.

## Consequences

The credential store and the steering setting are milestone 2 work and do not change the
order in `docs/project/NEXT.md`. Until they land, nothing is stored and the README says
so.

Every command in `shared/commands.js` that touches a tab has to respect the profile's
steering setting, and the test suite needs both halves for each: a `drive` profile
answers, an `off` profile refuses with an error that says why. Profile isolation is
already asserted for cookies; this extends the same assertion to steering.

The control-socket exposure in `SECURITY.md` becomes more serious once credentials
exist, which moves NEXT item C1 (OS-permissioned socket) from "gets harder the longer it
sits" to a prerequisite for the credential store.

Claude's own accounts live in the `claude` profile, as they do today. Nothing about this
decision gives Claude access to the `lloyd` profile's logins unless Lloyd sets that
profile to `drive`.

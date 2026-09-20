# Security

## Reporting

Report vulnerabilities privately through GitHub's security advisory form on this
repository rather than opening an issue.

## Known exposure

Stated plainly because it is by design rather than by accident.

**The control socket accepts arbitrary code.** Mondrian runs a WebSocket server on
localhost so Claude can steer it. Two of its commands, `eval_js` and `ui_eval`, execute
JavaScript in a page and in the browser's own interface. Access is gated by a token,
regenerated on every launch, written to `.runtime/control.json`.

Any process running as the same user can read that file. On a single-user machine this is
an acceptable trade for a tool the user is deliberately handing to an agent. It is not
acceptable in software distributed to people who did not make that choice, and it is
being changed before any public release: an OS-permissioned socket rather than a TCP
port, and a build-time decision about whether the steering commands are present in a
consumer build at all.

Until that lands, treat a Mondrian install as equivalent to granting local code execution
to anything already running on the machine.

**Steering and credentials.** Mondrian is designed to let an agent read and act in the
pages you browse. Once credentials are stored (ADR 0012, not yet built) that makes a
`drive` profile a prompt-injection target: a page can mislead the agent into acting, as
you, inside that profile. The boundary is the profile: credentials never reach the
steering layer, an `off` profile is invisible to it, and nothing on the control socket
can change a profile's setting. The credential store does not ship before the control
socket above is OS-permissioned.

**Frame-header stripping.** Composed pages in `pages/` may frame sites that send
`X-Frame-Options` or `frame-ancestors`. The scope is subframes of those files only, and
the test suite asserts both halves: a composed page may frame a site that refuses, a
normal page still may not. Widening this scope would make Mondrian a clickjacking tool.

**Scriptlets.** Filter-list scriptlets execute in the page's own world. They come from
EasyList, they are the component most likely to break a site, and they can be disabled
without losing network blocking or element hiding.

## Supported versions

Pre-release. No version is supported yet.

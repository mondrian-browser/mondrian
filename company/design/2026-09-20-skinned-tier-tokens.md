# The skinned tier, and what it will need from the theme tokens

2026-09-20. Design run. Trigger: the `[needs-design]` tag on the setup entry of
20 September, which asked design to read ADR 0011 and say what the skinned tier's base
stylesheet needs from the theme tokens. This is design's first entry, so there is no
previous note to compare against.

## What I looked at

ADR 0011 and ADR 0013, `docs/project/01-CONCEPT.md` in full, `docs/project/NEXT.md`
(where the skinned tier sits under "Not now", milestone 2), `app/chrome/index.html`,
`app/chrome/chrome.css`, the theme loading path in `app/chrome/chrome.js`, and all three
theme files. I could not render `docs/concept/concept-layout.pdf` in this container, so
the visual reference for this note is the concept document's own description rather than
the ten pages. Nothing below rests on a detail that only the PDF carries.

Nothing here proposes building the skinned tier. It is milestone 2 and NEXT says not to
start it early. This is a note about what milestone 1 should avoid painting itself into.

## What holds

The token idea itself is sound and the chrome really does follow it. One `:root` block in
`chrome.css` carries the defaults, a theme file is injected after it into `#theme-css`,
and `themes/custom.css` after that, so a theme is a short list of overrides and the whole
browser moves. Sixteen tokens and two font stacks is a small enough vocabulary to hold in
your head, which is the point.

The three-tier framing in ADR 0011 is also the right shape for design. A page that keeps
its own layout but arrives in Mondrian's type and colour is still recognisably the same
browser, and that is a far better answer than an escape hatch to raw. The tier is per
site, it is decided before first paint, and it rides the document-start CSS channel that
already exists, so the filter stays in front of paint in all three tiers. That is the one
rule from section 8b that a skinning tier could easily have broken, and it does not.

## What does not

**The theme files are not self-sufficient, and tier 2 will need them to be.** Inside the
chrome this does not matter, because `chrome.css` is always loaded first and carries
every default. `themes/default.css` declares eleven tokens and leaves out `--good`,
`--warn`, `--radius`, `--radius-sm`, `--font` and `--mono`; `paper.css` leaves out the
radii and the fonts. A skinned-tier stylesheet is injected into a site's document, where
`chrome.css` is not present and never will be. If the theme file is the thing that gets
sent, then under `default` and `paper` a skinned site arrives with no corner radius and
no font defined at all. Either every theme file declares the full set, or the base
stylesheet has to carry a duplicate fallback layer, and a duplicated palette will drift
from the chrome's within a month. The first is much cheaper and can be done today.

**Nothing in the token set says whether a theme is light or dark.** `color-scheme` does
not appear anywhere in the repository. Skinning an arbitrary site means the browser has
to tell the page's UA which scheme it is in, before first paint, or the site's form
controls, its scrollbars and the canvas below its content keep rendering to the UA
default while everything Mondrian styled goes dark. A theme cannot state this today.
It needs a token, something as plain as `--scheme: dark`, declared in every theme file,
so that one line in the base stylesheet can set `color-scheme` from it. This is also
worth having in the chrome for its own sake, since the chrome is a dark document with no
declared scheme.

**The palette is a chrome palette, not a document palette.** It has grounds, a rule
colour and three weights of text, which is everything a toolbar needs and not much of
what a page needs. There is no link colour, no visited colour, no selection colour, no
focus ring, no ground for code and pre, no table rule and no highlight. A base stylesheet
restyling arbitrary sites has to answer all of those, and with today's vocabulary its
only honest answer is `--accent` for each one. That breaks the concept's own rule about
destijl, where the primaries appear only where something is active: the first paragraph
with two links in it would put de Stijl red across the page as ordinary body text, and
the red would stop meaning "active" everywhere else in the browser. Whoever builds tier 2
should add the document half of the palette as tokens rather than reaching for `--accent`
six times. Related, and smaller: `--font` and `--mono` are families only. There is no
base size, no scale, no measure and no rhythm unit, and the concept asks tier 1 for text
at a fixed measure. If the two tiers each invent their own measure the same site will
look like two different browsers depending on which tier it landed in.

**The chrome does not honour its own corner token, so no theme can square the corners
off.** This is the one I can act on now, and it matters mainly as a warning about how the
base stylesheet gets written. `chrome.css` sets `--radius` and `--radius-sm`, then uses
them in four places and writes a literal in fifteen others. `destijl.css` sets both to
`0px` on the stated intent that de Stijl means square, and the result is that the omnibox
stays a fully rounded pill at 16px, the tabs keep their 8px top corners, and the chips,
the favicon, the blocked-count badge, the panel tabs and the status strip all keep theirs
too. The theme says square and the browser renders rounded. A base stylesheet written the
same way, with literals for the values a theme is supposed to own, would be unreachable
by any theme in exactly this manner, and it would be much harder to notice there than it
is here.

## What I recommend

Route the rectangle corners in `chrome.css` through tokens, and give `destijl.css` the
zeros it is already asking for. Three new tokens do it: `--radius-pill` for the omnibox
and the blocked-count badge, `--radius-tab` for the top corners of a tab, and
`--radius-xs` for the small chips. Their defaults are chosen so that `default` and
`paper` keep the look they have today. Only `destijl` changes, and it changes into what
its own comment says it is. PR on `claude/design-destijl-corners`.

Measured rather than assumed, with a throwaway Electron harness that loads the real
chrome document, injects each real theme file over it and reads the computed corner
radius back. Under `destijl` every element listed above went from its literal to `0px`;
the omnibox in particular went from a 16px pill to square. Under `default` and `paper`
the omnibox, the tab, the profile pill and the icon buttons are unchanged, and five small
chips move by exactly one pixel: the favicon and the tab close button from three and five
to four, the profile chip from five to four, the panel tab and the status strip from six
to seven. The blocked-count badge is the one number that looks alarming and is not. Its
computed radius goes from 7px to 16px, but the badge is 13px tall, so Chromium clamps it
to half the height and it paints at 6.5px where it painted at 7px. It was a pill before
and it is a pill now, which is the point of putting it on `--radius-pill`.

That covers ten of the fifteen literals. I am deliberately leaving five alone: the
loading spinner, the rules dot, both halves of the toggle switch, and the two-pixel
rounding on the bar under the active tab. Whether de Stijl allows a round indicator is a
real design question and not a token question, a square switch track with a round knob
inside it would look like a mistake, and two pixels of radius on a two-pixel bar is not
visible in either theme. If Lloyd wants the circles square too it is a second, smaller
change and it should be decided rather than swept in here.

On the test suite: `npm test` cannot run against `main` in a cloud container today,
because it hits the boot failure that engineering's PR #1 fixes and that is still waiting
on Lloyd. The change was therefore verified by moving these two files onto PR #1's branch
and running the suite there: 93 passed, 0 failed, including the four checks that exercise
the chrome UI and the theme swap. Nothing in this change is reachable by the suite in any
case, since no check asserts a corner radius, which is part of why the destijl gap
survived this long.

Everything else above is a note for whoever builds the skinned tier, not work for today.
The three token gaps, self-sufficient theme files, a light or dark declaration, and the
document half of the palette, should be settled as part of that milestone rather than
guessed at when the base stylesheet is first written. Tagged `[needs-engineering]` in the
log so it can become a NEXT item under milestone 2 when the milestone opens, not before.

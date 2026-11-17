# recruited.tools brand kit

Version 1, 17 November 2026. The hiring-side sibling of hired.tools.

Hired is an applicant tracking system for applicants. Recruited is the one for the people hiring: an open-source ATS that runs on MCP, posts a role to every board, sends screening forms, and records how each answer reached the form. The two products share one family: the same tile, the same type, the same neutrals and the same voice. What tells them apart is the glyph inside the tile and one accent hue.

## Files

```
logo/mark-light.svg        The tile, dark ink on light backgrounds
logo/mark-dark.svg         The tile, light ink on dark backgrounds
logo/mark-mono.svg         One colour (currentColor), for embossing, single-ink print, icon fonts
logo/favicon.svg           Follows the OS theme on its own
logo/lockup-{light,dark}.svg   Mark + "recruited.tools", outlined paths, no font needed
logo/wordmark-{light,dark}.svg Text only, outlined paths
logo/family.svg            Hired and Recruited side by side
tokens/tokens.css          Every colour (hex + OKLCH), light and dark, plus type and radius
tokens/tokens.json         The same values for anything that is not CSS
tokens/tailwind-theme.css  A Tailwind v4 @theme block that maps the tokens to utilities
github-graphics/           banner-{light,dark}.png (2560x880), social-preview-{light,dark}.png (2560x1280)
source/                    The HTML and scripts that render the graphics and logos
```

## The mark

A rounded tile (64-unit square, 15-unit corner radius) with a person cut out of it: a head, a shoulder bar, and a fainter line beneath. Hired's tile holds three left-aligned bars that step outward, a document growing. Recruited's holds a person, centred, because the employer's side of the table is looking at someone rather than a page.

- The mark has no colour of its own. It is cut out of the foreground ink and inverts with the theme. This is the same rule Hired follows, and for the same reason: the accent and the data colours are already spoken for.
- Clear space is a quarter of the tile on every side. Minimum size is 16px on screen; below 24px use `mark-mono.svg` or the favicon, where the faint line is solid.
- Don't recolour the tile with the accent, add a gradient, outline it, rotate it, or put the person on anything but the tile.
- Geometry, for rebuilding it in code: tile `rx 15`; head `circle 32,24 r8`; shoulders `rect 16,37 32x7 rx3.5`; line `rect 22,47 20x5 rx2.5` at 55% opacity.

## The name

Written `recruited.tools`, lowercase, with `.tools` in the muted ink. In running prose, "Recruited" with a capital is fine, the way Hired is "Hired". Never "Recruited.Tools", "RecruitedTools" or "RT". In the lockup the mark is 1.2x the font size of the wordmark, with a gap of 0.3x the mark.

## Colour

Neutrals are Hired's, hue 265, so screenshots of the two products sit together. Everything else is new.

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `#F9FAFB` | `#0E0F12` | Page |
| `surface` | `#FFFFFF` | `#18191D` | Cards, panels |
| `foreground` | `#17181C` | `#F3F3F5` | Text, the mark |
| `muted` | `#626569` | `#96989D` | Labels, `.tools` |
| `faint` | `#707277` | `#7E8085` | Metadata, timestamps |
| `border` | `#DEE0E2` | `#2C2E31` | Hairlines |
| `primary` | `#0075BA` | `#3CA9E5` | Links, primary button, focus, selection |

**One accent.** `primary` is a sky blue, a step cyan of Hired's cobalt (hue 240 against Hired's 254). Use it for things you can act on and for nothing decorative. It passes 4.5:1 for text on both backgrounds.

**Tier** is data, never decoration: `tier-a` green (`#168B49` / `#4DBF74`), `tier-b` the accent blue, `tier-c` neutral grey. A-tier green at body size is for bars and chips; for green text under 18px use `success` on a tint.

**Provenance** is the colour set that is Recruited's own: how a screening answer reached the form.

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `typed` | `#17181C` | `#F3F3F5` | Keystrokes in the field. Plain ink, because typed is the default and should not draw the eye. |
| `pasted` | `#BA6900` | `#ECA851` | Arrived by paste. Amber: worth a look, not a verdict. |
| `ai` | `#7C54CD` | `#A689F1` | Likely written with AI. Violet, a hue nothing else in the system uses. |

Show provenance as a highlight behind the text (the colour at 20%) and as a stacked bar with the percentages written out. Never as red, and never as a score on its own: it is a signal for a person to read, and the copy should say "likely" wherever the system is inferring.

Status colours (`destructive`, `success`, `warning`) follow Hired's.

## Type

- **Inter** for everything. Weights 400, 500 and 600, nothing heavier. Turn on `cv02 cv03 cv04 cv11 ss01`, which is what Hired does.
- **JetBrains Mono** for tool names, arguments, ids, eyebrows and anything a person might copy. Weights 400 and 500.
- Display headings: 600 weight, tracking −0.035em to −0.045em, line height 1.02 to 1.05. Two-line headlines put the second line in `muted`.
- Body: 14px in the app, 16 to 19px on marketing, line height 1.55. Numbers use tabular figures.
- Eyebrows: mono, 11 to 12px, uppercase, tracking +0.06em, `faint`.

## Voice

The same voice as Hired: plain, direct, second person, no marketing, no exclamation marks, no emoji, contractions fine. Sentences carry information.

The audience changes, so a few things are specific to Recruited:

- **Talk to the person hiring, not to "talent teams".** Small teams and founders hiring their first ten people. "Post one role to every board", not "omnichannel sourcing".
- **Treat candidates as people.** Recruited sits on the side of the table with power. Copy never mocks applicants, never calls AI use "cheating", and never presents a provenance signal as proof. Say what was observed: "pasted", "likely written with AI", "typed in 4 minutes".
- **Name the tool when it helps.** MCP is the product, so it is fine to show `rank_applicants(...)` on a banner. Write tool names in mono, exactly as they are.
- **Numbers are real or labelled.** Anything on a banner or a slide that comes from sample data says so where it is used outside a graphic.

Lines that fit:

- Hire from a conversation. Know who wrote the answers.
- Post a role to every board, send screening forms, and see which answers were typed, pasted or written with AI.
- Ask your assistant who's worth a call. It reads the same pipeline you do.

Lines that don't: "Supercharge your hiring!", "AI-powered talent intelligence", "Catch candidates cheating".

## GitHub graphics

Rendered at 2x from `source/graphics.html`. The banner goes at the top of the README inside a `<picture>` with both themes; the social preview goes in the repository's settings (light reads better in link unfurls, dark matches the README).

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/github-graphics/banner-dark.png">
  <img alt="recruited.tools: hire from a conversation, know who wrote the answers" src="brand/github-graphics/banner-light.png">
</picture>
```

The applicant, answer and percentages on the card are illustrative, not product data.

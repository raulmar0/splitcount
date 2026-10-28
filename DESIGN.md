# Entre design system

Entre is a working expense ledger. Its first question is “What is my balance in this group, and what should happen next?” The selected group, personal balance, recent expenses and suggested payments answer it in that order. Adding an expense and sharing the group remain visible in the title row.

The replacement visual direction is **True-black flat**, taste-skill seed **1298005779**. It uses lightness alone for elevation and keeps colour on data and status. Its face comes from Entre’s existing Manrope wordmark and shared-group identity, a warm near-black ground, and the recognizable sequence of people and suggested payments. The design uses no photographic hero, slogans, emoji navigation, decorative cards, gradients, glass, glows or page-load choreography.

## Tokens

The source of truth is `src/styles.css`. Every interface colour is a semantic custom property; the light theme overrides those properties through `:root[data-theme='light']`.

| Role | Dark default | Light option |
| --- | --- | --- |
| Ground | `#10100f` | `#f5f5f1` |
| Surface | `#191918` | `#ffffff` |
| Raised surface | `#252523` | `#edede7` |
| Text | `#f1f0eb` | `#252521` |
| Secondary text | `#b5b5ac` | `#57574f` |
| Metadata and placeholders | `#96968d` | `#64645b` |
| Primary control | `#e8e7e0` | `#292925` |
| Data and positive status | `#9db991` | `#4e7044` |
| Destructive/error text | `#e6a29d` | `#a4433c` |

The chart’s leading segment uses the data hue; all remaining segments use neutral values. Category icons are plain, unboxed outlines. Debt amounts retain a visible sign and use normal text rather than repeated warning colour. Error messages use an explicit semantic pair.

## Type and layout

One loaded family, **Manrope**, carries the interface. The scale is 12px metadata, 14px body and labels, 16px section titles, 24px page titles and secondary money, and 32px personal balance. Money and changing counts use tabular figures. Text uses sentence case and normal tracking, except a slight negative tracking on titles and money.

The labeled 232px sidebar remains because the app contains multiple named groups plus activity, help and local data tools. A rail or the dealt “no sidebar” shell would hide the names users need to distinguish their plans. At 1000px and below it folds into the menu opened from the top bar. The page has equal 32px desktop gutters, 24px tablet gutters and 16px phone gutters.

At 1440px: `232 sidebar + 32 margin + 820 main list + 24 gap + 300 payment rail + 32 margin = 1440`. Main sections align to the same outer edges. The selected group’s members, currency and sync state sit in a compact metadata strip. Three money figures share one divided band. The phone keeps a full-width personal balance followed by two secondary figures, then the expense list and payment panel.

Panels use 10px corners and controls use 6px corners throughout. These deliberately adapt the dealt 20px/pill defaults to the existing ledger’s compact forms and familiar dialog controls; shape does not compete with monetary data. Circles are reserved for people. There are no resting shadows; dropdowns, dialogs and notices that float use one soft shadow token.

## Behaviour and states

Dark is the default, including before React loads. A valid explicit preference is stored as `entre-theme-v1`; blocked or missing storage safely returns dark. A theme button in the header changes the preference. All dialogs, forms, native inputs, focus rings, selections and placeholders inherit the active theme.

Controls have readable hover, focus, active and disabled treatments. Pending shared writes retain the form’s context. Sync errors provide recovery copy beside the group; local storage failures retain the backup action. Mobile controls have a minimum 44px target. Reduced-motion preferences remove transitions; the app uses no decorative animation.

Browser rendering and interaction verification are part of the root integration review. Do not treat this design record alone as evidence that a screenshot or automated visual check passed.

Phone refinement: balance and group total form a compact two-column band; per-person average is omitted below580px. Group identity stays on one64px row so the expense list appears earlier without shrinking text.

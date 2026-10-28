# Splitcount design system

Splitcount is a shared-expense ledger designed from the phone. The first screen answers “Which plan do I need?” with groups, members, currency and a personal balance for each plan. Inside a group, the personal balance, group total, expenses and suggested payments explain what should happen next. Each amount retains its group's currency.

The identity pairs the selected ImageGen **Reparto** symbol with a live **Manrope** Splitcount wordmark. Three mint forms fit around a Y-shaped negative space, suggesting a shared expense divided into equal parts. The transparent PNG is used in the header, desktop sidebar, favicon and app metadata. [Logo provenance and prompts](docs/brand/splitcount-logo.md) identify the selected proposal, transparent refinement and shipped asset. [The earlier Buenpar logo record](docs/brand/logo-prompt.md) remains as history.

The visual foundation continues the **True-black flat** direction, taste-skill seed **1298005779**. Warm near-black surfaces use lightness for elevation; mint controls and restrained status colours establish emphasis. The interface uses no photographic hero, slogans, emoji navigation, rainbow categories, gradients, glass, glows or page-load choreography.

## Tokens

The source of truth is `src/styles.css`. Interface colours use semantic custom properties; the light theme overrides them through `:root[data-theme='light']`.

| Role | Dark default | Light option |
| --- | --- | --- |
| Ground | `#10100f` | `#f5f5f1` |
| Surface | `#191918` | `#ffffff` |
| Raised surface | `#252523` | `#edede7` |
| Text | `#f1f0eb` | `#252521` |
| Secondary text | `#b5b5ac` | `#57574f` |
| Metadata and placeholders | `#96968d` | `#64645b` |
| Primary control / accent | `#b4d9c8` | `#315f4e` |
| Primary control text | `#14251d` | `#ffffff` |
| Positive status | `#9db991` | `#4e7044` |
| Destructive/error text | `#e6a29d` | `#a4433c` |

The chart's leading segment uses the accent; remaining segments use neutral values. Category icons are plain outlines. Debt amounts retain a visible sign and use normal text rather than repeated warning colour. Error messages use an explicit semantic pair.

## Phone layout and navigation

The base stylesheet targets 320–430px phones with 16px page gutters. A compact sticky header holds Splitcount, Back within a group, and the theme control. Persistent bottom navigation offers **Grupos, Gasto, Actividad and Ajustes**, with a prominent Gasto action. Content and navigation account for the bottom safe area.

Grupos uses a single column of plan cards with members, currency, local/shared status and personal balance. It does not aggregate balances across currencies. Group detail shows the title and sharing action, a compact member strip, then personal balance and group total. Below 360px those figures stack to keep whole amounts readable; from 360px they share a divided two-column band. The per-person average is reserved for desktop.

The main panel has **Gastos, Saldos and Resumen** tabs. Gastos keeps search visible and opens filtering and ordering in a separate full-screen dialog. Saldos contains suggested transfers, member balances and payment history. Actividad is a separate screen spanning all groups. Ajustes contains appearance, backup, import and help.

Expense entry has two steps: **El gasto** for amount, description and payer; **El reparto** for participants and equal or exact amounts. Date, category and note are progressively revealed under Más detalles. Validation identifies and focuses the relevant field. Exact splits display the remaining amount and allow zero shares when the total still matches.

## Progressive enhancements

At **720px**, page gutters become 24px, Grupos gains two columns, more metadata and expense icons appear, and dialogs become bounded with a maximum width of 560px. Phone-style bottom navigation remains.

At **1100px**, a labeled 232px sidebar and a 300px transfer column appear. The bottom navigation gives way to the sidebar; the title row adds the expense action. Desktop uses 32px gutters, visible category and ordering controls, three summary figures and the full expense list. At **1440px**, Grupos expands to three card columns.

Forms use native modal dialogs. On phones they occupy the viewport; the dialog itself scrolls, its header remains sticky, and the expense flow has a sticky action footer with safe-area spacing. Controls use at least 44px touch targets, and text fields use 16px input text. These patterns require real-device keyboard and viewport checks as part of visual verification.

## Type and shape

Manrope carries the interface. The base scale is 12px metadata, 14px body and labels, 16px section titles and form inputs, 24px page titles and secondary money, and 28px personal balance on phones. Personal balance grows to 32px from tablet width; the expense amount input uses 40px. Money and changing counts use tabular figures. Text uses sentence case with slight negative tracking on titles and money.

Panels use 10px corners and controls use 6px corners. Circles identify people. Resting panels have no shadows; dropdowns, dialogs and notices use one soft floating-shadow token.

## Behaviour and states

Dark is the default, including before React loads. A valid preference persists as `entre-theme-v1`; missing or blocked storage safely returns dark. Ajustes and the header theme button update the same preference. Dialogs, forms, native inputs, focus rings, selections and placeholders inherit the active theme.

Navigation stores the screen and selected group in browser history. The internal `buenpar` property stays compatible across the rename, as do `entre-state-v1` and `entre-theme-v1` in browser storage. Back closes an open overlay while preserving its group, then follows screen history. Pending writes keep their dialog open. Reload restores a valid saved history route; removed groups resolve to Grupos. Invitations retain unrelated cached groups.

Expense drafts and payment forms retain their original group context. Shared writes wait for server confirmation; failures preserve draft values and expose recovery. Sync errors appear with the group, and local-storage failures offer backup. Shared identities are local display preferences; the invitation link grants edit access. Controls have hover, focus, active and disabled treatments. Reduced-motion preferences remove transitions.

Browser rendering and interaction verification are part of the integration review. This design record alone is not evidence that a screenshot, keyboard check or visual test passed. The phone flows were established in [the mobile design under the earlier Buenpar name](docs/superpowers/specs/2026-10-27-buenpar-mobile-design.md); that specification retains its original name and context. The current identity is Splitcount with the selected Reparto symbol.

Google account controls live in Ajustes → Cuenta and reuse the existing button, profile, status and error vocabulary. Incorporating guest groups uses a confirmation dialog with real groups and examples separated; examples are unselected by default. Account scope is distinct from choosing a member's balance. If the Google session expires in a form, inline sign-in appears above its existing fields, retaining the draft and the same account workspace instead of dismissing the dialog.

Integration review on 2026-10-27 covered browser widths of 320, 360, 390, 768 and 1440px, navigation, full-screen dialogs, exact splits, payments and persisted theme choice. A shared test group was opened in a second browser session, Ana was selected as the local identity, and a new expense of 90 appeared automatically in the first session with its balance updated. The full 144-test suite, production build and whitespace check passed. Physical-device software-keyboard behaviour remains a separate check.

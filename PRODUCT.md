# Entre

Entre is a Spanish-language app for splitting expenses among friends, households and travel groups. People create a group, name its members, record who paid, divide an expense equally or by exact amounts, review balances and register payments made outside the app. Entre tracks the ledger; it does not transfer money.

The main job is recording an expense while keeping the group’s total and each person’s balance understandable. The selected group’s name is the page title. The personal balance leads; the group total and per-person average support it. Suggested payments reduce the number of transfers needed to settle the group.

## Local and shared groups

Local groups persist in the current browser and can be backed up or restored with JSON. Expenses can be exported as CSV. Seeded groups are examples and remain identified as examples.

A group can be shared through a link. **Anyone with the link can view and edit the shared group.** The share dialog states that access model before the link is created or copied. Shared changes synchronize through a Cloudflare service alongside the app hosted on GitHub Pages. Sync states distinguish saved data, pending work and recoverable errors.

The member identity chosen on a device is a local preference, not authentication. Choosing a member changes whose balance is shown and the defaults for recording expenses; it does not provide an account or restrict the shared link’s edit rights. Shared-link access and member identity must stay distinct in interface copy.

## Constraints and commitments

- Preserve expense arithmetic, equal and exact splits, payment history, member names, export and restore behaviour.
- Keep the Entre mark and Manrope identity. The app defaults to a sober dark theme with a selectable light theme.
- Keep money precise, labelled with its currency, and formatted consistently. Never add fabricated growth metrics or decorative financial claims.
- Support desktop, tablet and phone, with a menu for the labeled sidebar at narrow widths, readable metadata and touch targets of at least 44px on phones.
- Use task-focused copy, an object title, flat surfaces and one restrained green data hue. No decorative photography, slogan headers, emoji navigation or rainbow category styling.

The app is an Operate surface: success means a person can enter an expense, share its group, identify themselves locally and understand what is owed without learning a custom interaction pattern.

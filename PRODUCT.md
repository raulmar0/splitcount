# Splitcount

Splitcount is a Spanish-language app for splitting expenses among friends, households and travel groups. People create a group, name its members, record who paid, divide an expense equally or by exact amounts, review balances and register payments made outside the app. Splitcount tracks the ledger; it does not transfer money.

## Phone-first tasks

The app starts at **Grupos**, a list of plans with members, currency and the current person's balance in each group. Balances stay in their own currencies. A shared group without a chosen local identity asks the person to select their name before showing a personal balance.

The phone and tablet navigation keeps **Grupos, Gasto, Actividad and Ajustes** within reach. Gasto uses the open group or asks which group to use from another screen. Actividad collects expenses and payments across groups. Ajustes holds theme selection, JSON backup and restore, and help.

Within a group, the group name is the page title. Personal balance and group total lead into **Gastos, Saldos and Resumen**. Suggested transfers and recorded payments belong in Saldos on phones. Search, category filtering, ordering, expense editing and deletion, and CSV export remain available. Wider desktop layouts add named groups in a sidebar, a transfer column and the per-person average.

Recording an expense has two steps: amount, description and payer, followed by participants and the split. Date, category and note appear under **Más detalles**. Forms fill the phone viewport; larger screens use bounded dialogs. The expense action footer stays visible within the scrolling dialog. A form keeps its original group and draft while shared data refreshes. Remote saves wait for acceptance; failures keep the draft and show an error.

Browser Back closes an open overlay before changing screens, preserving the form's group. Pending writes prevent dismissal until the result is known. Without an overlay, Back follows in-app history; reload restores a valid history route. An invitation opens its group while retaining unrelated groups.

## Local and shared groups

Local groups persist in the current browser and can be backed up or restored with JSON. Import validates the entire backup before replacing local data. Expenses can be exported as CSV; CSV is an analysis export, while JSON is the complete backup. Seeded groups are examples and remain identified as examples.

A group can be shared through a link. **Anyone with the link can view and edit the shared group.** The share dialog states that access model before the link is created or copied. The capability key lives in the URL fragment, travels to the API through `Authorization`, and is stored as a hash on the server. JSON backups include shared-group capabilities and must be kept private.

Shared groups persist in a Cloudflare Durable Object with SQLite per group; the frontend is hosted on GitHub Pages. The active group refreshes every three seconds and on window focus or restored connectivity. Independent inserts combine; competing edits to the same movement surface a conflict. Pending shared writes suppress polling. Offline access shows the last cached copy; shared writes require a connection. Leaving a group removes it from this device and preserves other people's access.

The member identity chosen on a device is a local preference, not authentication. Choosing a member changes whose balance is shown and the defaults for recording expenses; it does not provide an account or restrict the shared link's edit rights. Shared-link access and member identity must stay distinct in interface copy.

## Constraints and commitments

- Preserve expense arithmetic in integer cents, equal and exact splits, payment history, member names, export and restore behaviour. Label currencies and keep them separate.
- Use the selected ImageGen **Reparto** symbol: three mint forms separated by a Y-shaped space, with a live Manrope Splitcount wordmark. Default to dark and offer a persisted light theme in Ajustes and the header.
- Build the base layout for 320–430px phones, with touch targets of at least 44px and safe-area spacing. Stack summary amounts below 360px, then use two columns. Enhance at 720px for tablet and 1100px for the desktop sidebar and transfer column; 1440px adds a third group-card column.
- Use task-focused copy, an object title, neutral surfaces and restrained green controls and status. Keep financial data readable without decorative photography, slogan headers, emoji navigation or rainbow categories.
- Preserve existing data and invitation capabilities: `entre-state-v1`, `entre-theme-v1`, the browser history property `buenpar` and `entre-sync` remain compatible. The repository is `raulmar0/splitcount` and the public path is `/splitcount/`. Older invitation keys remain valid when the old `/entre-app/` path is replaced with `/splitcount/` and the full fragment is retained. New export filenames use Splitcount. Earlier Buenpar and Entre backups remain valid.

Success means a person can enter an expense from their phone, share its group, identify themselves locally and understand what is owed without learning a custom interaction pattern.

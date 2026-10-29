# Splitcount

Splitcount is an app available in Spanish, English, French, Portuguese and Italian for splitting expenses among friends, households and travel groups. People create a group, name its members, record who paid, divide an expense equally or by exact amounts, review balances and register payments made outside the app. Splitcount tracks the ledger; it does not transfer money.

## Phone-first tasks

The app starts at **Grupos**, a list of plans with members, currency and the current person's balance in each group. Balances stay in their own currencies. A shared group without a chosen local identity asks the person to select their name before showing a personal balance.

The phone and tablet navigation keeps **Grupos, Gasto and Ajustes** within reach. Gasto uses the open group or asks which group to use from another screen. Expense and payment history stays inside each group. Ajustes holds theme selection, JSON backup and restore, and help.

Within a group, the group name is the page title. Personal balance and group total lead into **Gastos and Saldos**. Suggested transfers and recorded payments belong in Saldos on phones. Search, category filtering, ordering, expense editing and deletion, and CSV export remain available. Wider desktop layouts add named groups in a sidebar, a transfer column and the per-person average.

Recording an expense uses one form: amount, description and payer, then optional details followed by “¿Para quién?” for participants and the equal or exact split. Date, category and note appear under **Más detalles**. Forms fill the phone viewport; larger screens use bounded dialogs. The expense action footer stays visible within the scrolling dialog. A form keeps its original group and draft while shared data refreshes. Remote saves wait for acceptance; failures keep the draft and show an error.

Browser Back closes an open overlay before changing screens, preserving the form's group. Pending writes prevent dismissal until the result is known. Without an overlay, Back follows in-app history; reload restores a valid history route. An invitation opens its group while retaining unrelated groups.

## Local and shared groups

Local groups persist in the current browser and can be backed up or restored with JSON. Import validates the entire backup before replacing local data. Expenses can be exported as CSV; CSV is an analysis export, while JSON is the complete backup. New guest workspaces start empty, including when storage is unavailable or invalid. Valid existing groups remain intact; no example data is inserted.

After group creation or adding members, people can choose to invite now or save without inviting. The invitation flow selects a member and opens SMS, WhatsApp or email with a prepared private group link. It never sends automatically. A group can also be shared through a link. **Anyone with the link can view and edit the shared group.** The share dialog states that access model before the link is created or copied. The capability key lives in the URL fragment, travels to the API through `Authorization`, and is stored as a hash on the server. JSON backups include shared-group capabilities and must be kept private.

Shared groups persist in a Cloudflare Durable Object with SQLite per group; the frontend is hosted on GitHub Pages. The active group refreshes every three seconds and on window focus or restored connectivity. Independent inserts combine; competing edits to the same movement surface a conflict. Pending shared writes suppress polling. Offline access shows the last cached copy; shared writes require a connection. Leaving a group removes it from this device and preserves other people's access.

The member identity chosen in a group is a display preference, not authentication. It is device-local in guest mode and recovered across devices when signed in. Choosing a member changes whose balance is shown and the defaults for recording expenses; it does not restrict the shared link's edit rights. Shared-link access, Google authentication and member identity must stay distinct in interface copy.

## Optional Google accounts

Google sign-in recovers a private directory of groups and the member identity selected for each group. New groups default to synchronization with the approved account using the existing ledger engine. The storage control offers an explicit device-only alternative; guest groups remain local until sharing is activated. Local groups are unlimited in either mode; the guest browser workspace permits one shared group, while each Google account permits six, counting created groups and invitations. Existing over-quota workspaces remain usable and cannot grow. There is no expense/payment count cap; technical byte limits remain. Guest groups are incorporated only through explicit selection in Settings; examples are separate and unselected by default. Original guest copies remain intact. Account backup import adds shared references and restores local groups as local, rather than replacing the entire account. Directory refresh preserves local groups.

Each account has a separate browser cache. Logout clears that account's remote cache and returns to the existing guest workspace; account-local groups remain in this browser for the next login to the same account. It does not delete remote groups or other participants' access. Leaving a group while signed in removes its reference across the account's devices. Explicit invitation rejoining remains possible.

Google credentials are memory-only. Reload requires sign-in again; expiry retains the workspace and open forms, with inline renewal available without losing drafts. Switching Google identities requires explicit logout. Account-directory polling is deferred while dialogs are open so remote removal does not dismantle an editing session. Shared-link authorization remains unchanged; selecting a member is not an authorization role.

## Account approval and owner dashboard

Google accounts must receive approval before account synchronization. Verified `raulhdz40@gmail.com` is the administrator and always approved. Other identities first seen by the durable access registry enter pending. Pending accounts use the existing guest browser workspace with unlimited local groups and one shared group through anonymous capability sync; Google expiry and sign-out do not interrupt that workspace. Rejected accounts retain local work. Account directory reads and mutations remain blocked on the server for both statuses. Approval switches to the isolated account workspace with six shared slots, preserving guest originals for explicit incorporation without automatic uploads. Anonymous capability access remains unchanged. Refreshing pending status preserves guest work and drafts; approval opens the account workspace while preserving the guest originals.

Settings contains a private administration panel for pending, approved and rejected accounts, with versioned approval/rejection/revocation and no persisted client-side account list. Web Push is explicitly enabled per owner device. New requests trigger one best-effort generic notification without applicant identity. Durable VAPID keys and up to ten subscriptions live only in the registry. Notification clicks focus existing windows without navigating away from drafts. Deployment preserves all existing group/account namespaces and adds AccessRegistry/ACCESS before publishing the frontend.

## Constraints and commitments

- Preserve expense arithmetic in integer cents, equal and exact splits, payment history, member names, export and restore behaviour. Label currencies and keep them separate.
- Use the selected ImageGen **Reparto** symbol: three mint forms separated by a Y-shaped space, with a live Manrope Splitcount wordmark. Default to dark and offer a persisted light theme in Ajustes → Apariencia.
- Build the base layout for 320–430px phones, with touch targets of at least 44px and safe-area spacing. Stack summary amounts below 360px, then use two columns. Enhance at 720px for tablet and 1100px for the desktop sidebar and transfer column; 1440px adds a third group-card column.
- Use task-focused copy, an object title, neutral surfaces and restrained green controls and status. Keep financial data readable without decorative photography, slogan headers, emoji navigation or rainbow categories.
- Preserve existing data and invitation capabilities: `entre-state-v1`, `entre-theme-v1`, the browser history property `buenpar` and `entre-sync` remain compatible. The repository is `raulmar0/splitcount` and the public address is `https://splitcount.raulmar.com/`; the previous `/splitcount/` Pages address redirects there. Older invitation keys remain valid when the old `/entre-app/` path is replaced with `/splitcount/` and the full fragment is retained. New export filenames use Splitcount. Earlier Buenpar and Entre backups remain valid.

Success means a person can enter an expense from their phone, share its group, identify themselves locally and understand what is owed without learning a custom interaction pattern.

## Moving to the custom domain

Account groups recover through Google. Browser-local work stays in its previous origin. Settings links to a separate static recovery page on `raulmar0.github.io/splitcount-recovery/`, which previews prior guest groups and local-only account groups, then exports one private JSON backup per workspace on explicit click. It never sends these copies over the network or deletes the old storage. People import that backup using the existing flow on the new domain.

## Language preference

Settings offers System (default), Español, English, Français, Português and Italiano. System resolves the first supported browser language and falls back to Spanish. Explicit selection persists locally under `splitcount-language-v1`; stored ledger content and currency codes remain unchanged. Dates and money use Intl formatting for the selected language.

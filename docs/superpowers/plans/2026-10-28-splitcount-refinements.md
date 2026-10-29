# Splitcount refinements implementation plan

**Goal:** Apply the nine requested refinements and publish at `splitcount.raulmar.com`.

**Architecture:** Preserve React/Vite, the current Splitcount identity and the existing capability-based Cloudflare sync. Approved accounts default to synchronized groups; guests start empty. Sharing remains a deliberate action with a choice of recipient and channel.

**Constraints:** Preserve stored user data, account approval, group quotas, integer-cent arithmetic and private invitation fragments. No messages are sent automatically. Keep keyboard support, 320px layouts and reduced-motion preferences.

- [ ] Remove Activity navigation and restore obsolete Activity history to Groups; keep expense and payment history inside each group.
- [ ] Move theme selection exclusively to Settings and use a themed, responsive Google sign-in surface.
- [ ] Replace native selects with a shared keyboard-accessible component in group, expense, payment and filter forms.
- [ ] Make fresh guest workspaces empty, including when storage is blocked or invalid; preserve valid existing data.
- [ ] Default approved-account group creation to synchronization with an explicit local alternative and clear quota handling.
- [ ] After creating a group or adding people, offer optional invitations per person using SMS, WhatsApp or email, informed by Mobbin references; keep the existing explicit sharing permission and server validation.
- [ ] Add short action, dialog and menu motion with a reduced-motion override.
- [ ] Configure custom-domain DNS, Pages, API origins and Google OAuth; preserve other domain records.
- [ ] Run regression tests and production build, review the diff, exercise real browser flows in both themes and at phone/desktop widths, then publish and verify HTTPS/API on the custom domain.

**Review focus:** blocked storage, stale browser history, failed group writes retaining drafts, expired Google sessions, quotas when sharing a new local group, recipient validation, menu focus/clipping and custom-origin authentication.

# Section: In-app Notifications

Seller invite creation already persists `invite_received` for the buyer in the
invite transaction. No schema migration or browser push subscription is needed.

## Main files

- `apps/web/server/notifications.ts` — owner-scoped activity, feed, and read acknowledgement.
- `apps/web/lib/notification-links.ts` — type and metadata to in-app link, label, and icon.
- `apps/web/lib/notification-client.ts` — browser read receipts and the bell refresh event.
- `apps/web/components/notification-list.tsx` — notifications page feed (All/Unread, Mark all as read).
- `apps/web/app/{buyer,seller}/notifications`, `apps/web/app/notifications` — feed pages by role.
- `apps/web/app/api/notifications/route.ts` — authenticated GET and explicit PATCH.
- `apps/web/components/notification-bell.tsx` — unread bell, popover, and buyer popup.
- `apps/web/components/notification-bell-state.ts` — new-invite detection without historical replay.
- `apps/web/components/notification-bell.css` — desktop and mobile presentation.
- `apps/web/app/layout.tsx` — server seed and shared header integration.
- `apps/web/server/messaging/unread.ts` — capped unread-conversation count for the Messages badge.
- `apps/web/components/messaging/unread-conversations.ts` — browser badge store and read announcement.
- `apps/web/components/primary-nav.tsx`, `apps/web/components/primary-nav.css` — Messages nav badge.

## Contract

GET returns the current user's unread count, the five newest notifications, and
the newest buyer invite notice ID, creation timestamp, and read flag. The newest
invite includes read notices so acknowledgement does not move the popup baseline
backwards. Non-buyers receive no invite hint. Count, hint, and recent list share
a repeatable-read transaction snapshot so a concurrently committed invite cannot
advance a stale popup baseline.

Each notification item carries only its ID, type, title, body, timestamp, read
flag, and a server-derived `href`/`actionLabel` from `notificationTarget`.
Raw metadata never reaches the browser. Targets are fixed internal paths; the
only interpolated value is a negotiation ID that must match
`[A-Za-z0-9_-]{1,64}`, otherwise the link falls back to `/messages`. The
client also rejects activity whose hrefs are not same-site paths. Destination
pages keep their own authorization; a link grants nothing. Seller copies of
invite notices (`invite_sent`, `invite_accepted`, `invite_declined`, and the
seller side of `invite_expired`/`invite_withdrawn`) carry `buyerProfileId` and
open Sent invites; buyer copies open Invites. `buyer_profile_unhidden` opens
the buyer profile, and `account_reinstated` opens the buyer profile, seller
properties, or the account page depending on what the account needs next.

PATCH accepts exactly `{ "all": true }` or `{ "notificationId": "..." }`, with
bounded JSON, same-origin checks, and owner-filtered idempotent writes. Every
response is private/no-store, including authentication and outage errors.

GET and PATCH success bodies also carry `unreadConversationCount` for the
Messages nav item: the number of conversations the inbox would list with an
unread message (same membership, cohort and unread rule; system updates count),
capped at 100 and shown as 99+. It is null for accounts without a buyer or
seller role, when messaging is disabled for the viewer's cohort, or when the
count fails; that failure is logged with sanitized details and never fails the
notification read. It is one bounded query after the notification snapshot.
There is no separate poll: the bell publishes the count from its own response.
The root layout's server seed still calls `readNotificationActivity`, so the
badge appears after the bell's first client poll; wrapping that seed in
`withUnreadConversationCount` would render it on the server.

Visible, online sessions poll about every five seconds with jitter, retry
backoff, and focus/connectivity recovery. Polls and acknowledgement requests
are serialized and abort on unmount. A missing server seed establishes a
baseline from the first successful read without replaying old invitations.

The bell stays visible on phones and lights for unread activity. Below 600px the
dropdown is pinned to the viewport under the sticky header with 16px side
margins, because the bell sits too far in from the right edge for a
bell-anchored 380px panel to fit. Only a newly
received unread buyer invitation triggers a dismissible popup. The popup does
not move focus on arrival; its View invites link and Dismiss control do not
acknowledge notices. Mark all read in the bell popover explicitly acknowledges
the current user's notices and refreshes page labels. Opening a notification
(dropdown or page row) marks only that ID read with a keepalive PATCH, updates
the row and count optimistically, and fires `liber:notifications-changed` so the
bell re-polls at once. Reads and page prefetches must remain free of
acknowledgement side effects.
A new unread invite appearing in an acknowledgement response still triggers its
popup; acknowledgement must not hide activity committed after the read update.
An acknowledged conversation read in a message thread fires
`liber:conversation-read` (the inbox clears that row) and
`liber:notifications-changed`; the bell re-polls at once, or once more right
after a poll that was already in flight, so the badge clears without waiting
for the next interval.

Verify service ownership, API origin/body/error handling, invitation baseline
transitions, and polling recovery. Use clearly labelled local synthetic fixtures
for interactive checks; never create production invites solely for UI testing.

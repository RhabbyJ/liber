# Section: In-app Notifications

Seller invite creation already persists `invite_received` for the buyer in the
invite transaction. No schema migration or browser push subscription is needed.

## Main files

- `apps/web/server/notifications.ts` — owner-scoped activity and read acknowledgement.
- `apps/web/app/api/notifications/route.ts` — authenticated GET and explicit PATCH.
- `apps/web/components/notification-bell.tsx` — unread bell, popover, and buyer popup.
- `apps/web/components/notification-bell-state.ts` — new-invite detection without historical replay.
- `apps/web/components/notification-bell.css` — desktop and mobile presentation.
- `apps/web/app/layout.tsx` — server seed and shared header integration.

## Contract

GET returns only the current user's unread count and newest buyer invite notice
ID, creation timestamp, and read flag. The newest invite includes read notices
so acknowledgement does not move the popup baseline backwards. It exposes no
seller, property, email, or account details. Non-buyers receive no invite hint.
Buyer count and invite hint share a repeatable-read transaction snapshot so a
concurrently committed invite cannot advance a stale popup baseline.

PATCH accepts exactly `{ "all": true }` or `{ "notificationId": "..." }`, with
bounded JSON, same-origin checks, and owner-filtered idempotent writes. Every
response is private/no-store, including authentication and outage errors.

Visible, online sessions poll about every five seconds with jitter, retry
backoff, and focus/connectivity recovery. Polls and acknowledgement requests
are serialized and abort on unmount. A missing server seed establishes a
baseline from the first successful read without replaying old invitations.

The bell stays visible on phones and lights for unread activity. Only a newly
received unread buyer invitation triggers a dismissible popup. The popup does
not move focus on arrival; its View invites link and Dismiss control do not
acknowledge notices. Mark all read in the bell popover explicitly acknowledges
the current user's notices and refreshes page labels. Reads and page prefetches
must remain free of acknowledgement side effects.
A new unread invite appearing in an acknowledgement response still triggers its
popup; acknowledgement must not hide activity committed after the read update.

Verify service ownership, API origin/body/error handling, invitation baseline
transitions, and polling recovery. Use clearly labelled local synthetic fixtures
for interactive checks; never create production invites solely for UI testing.

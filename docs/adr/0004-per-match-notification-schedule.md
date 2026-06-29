# Per-match notification schedule, single hourly engine

Match-day notifications to assigned people are no longer a single fixed midday blast. Each match has a computed send time keyed on its kickoff clock time in Argentina time (noon-inclusive): kickoff ≥ 12:00 → that day at 11:00; kickoff < 12:00 → the previous day at 22:00 (`computeSendAt` in `src/lib/notifications/schedule.ts`).

The scheduling engine collapses to the existing hourly tick (`0 * * * *`, ARG tz), which already fires exactly at 11:00 and 22:00 and acts as a catch-up on every other hour. The separate fixed midday cron and the global "are we past the send time?" gate are removed; a per-match `now ≥ computeSendAt(kickoff)` due-check replaces them. The candidate query widens to [start-of-today, end-of-tomorrow] so the 22:00 tick can see the next morning's matches.

## Considered options

- **Fixed midday blast (previous):** one send time for everyone. Simple, but mistimed for both early-morning and night matches.
- **Two discrete crons at 11:00 and 22:00:** explicit, but duplicates the query/marker logic and ignores that the hourly tick already lands on those minutes.
- **Single hourly engine + per-match send time (chosen):** one mechanism handles both send times, restart catch-up, and late-created matches.

## Consequences

- `day_notified_at` remains the once-only idempotency marker, stamped after one full attempt.
- The send core (`notifyMatch`) and recipient resolution (`buildMatchRecipients`) are shared by the automatic path and the manual "Enviar notificación a todos" action; the manual action always sends and (re)stamps the marker so the two never double-notify.
- `NOTIFICATIONS_CRON` is now unused and removed from the env accessor.
- Send times (11:00 / 22:00) and the noon boundary are fixed constants/logic; changing them is a code change, not configuration.
- Fixed-offset ARG math is exact only while Argentina observes no DST (see also ADR 0002).

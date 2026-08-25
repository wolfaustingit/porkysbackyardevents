/*
 * Which calendar this site reads.
 *
 * The id is committed rather than kept only in an environment variable, so a
 * fresh deploy renders the real schedule with no dashboard configuration at
 * all. That is a deliberate trade and it is safe here for one specific
 * reason: this calendar is already published to the public internet. Its id
 * appears in the embed URL, its ICS feed is readable by anyone without a
 * credential, and every event on it is going onto this very page. There is
 * nothing here to leak.
 *
 * It is NOT a pattern to copy for a private calendar. If this calendar is ever
 * made private, the id becomes a capability and belongs in an environment
 * variable only — delete the default below and set GOOGLE_CALENDAR_ID in
 * Cloudflare instead.
 */

export const DEFAULT_CALENDAR_ID =
  "c_ad5d6b63c372c04e1b249e5626f34d918ebd19975769686fa1b2d6e76df9c5e3@group.calendar.google.com";

/** Environment always wins, so a different calendar can be swapped in without a code change. */
export function resolveCalendarId(fromEnv: string | undefined): string {
  return (fromEnv ?? "").trim() || DEFAULT_CALENDAR_ID;
}

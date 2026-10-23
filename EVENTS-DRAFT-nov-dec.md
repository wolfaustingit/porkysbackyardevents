# November & December 2026 for `PUBLIC - Porky's Events`

**Revision 3 — final. 56 events, verified. Not yet on the calendar: the write is
blocked (see "How to apply this" below).**

Source: `EVENTS @ PORKY'S` (kandice.morrison@porkysbackyard.com) for Nov 1 – Dec 31
2026, plus the three weekly nights extended from the October entries already on the
public calendar, plus the Nov 20 line dancing night added by Andrea on Oct 23.

Target: `PUBLIC - Porky's Events`, the calendar `src/lib/config.ts` points the site at.
All times America/Chicago. **56 events. 2 private rentals left off. 8 already there.**

Companion file: **`porkys-nov-dec-2026.ics`** — the whole thing, importable in one go.

---

## The five weekly nights, as recurring series

`src/lib/ics.ts:17` supports `FREQ=WEEKLY`, `BYDAY` and `UNTIL`, so these go on as five
rules rather than 45 separate entries — one thing to edit when a night changes, instead
of nine. Each is `RRULE:FREQ=WEEKLY;BYDAY=<day>;UNTIL=20261231T235959Z`.

| Night | Time | Occurrences |
|---|---|---|
| Sunday Vendor Market | 11:00 am – 8:00 pm | 9 — Nov 1, 8, 15, 22, 29 · Dec 6, 13, 20, 27 |
| Football Sundays Live with Game Sound ON | 12:00 pm – 10:00 pm | 9 — same Sundays |
| Monday Night Football | 7:15 pm – 10:30 pm | 9 — Nov 2, 9, 16, 23, 30 · Dec 7, 14, 21, 28 |
| Karaoke with DJ Damien | 6:00 pm – 10:00 pm | 9 — Nov 4, 11, 18, 25 · Dec 2, 9, 16, 23, 30 |
| Social Saturdays with DJ Chris Coke | 6:00 pm – 12:00 am | 8 — Nov 7, 14, 21, 28 · Dec 5, 12, 19, 26 |

44 occurrences. Monday Night Football keeps its October description, "Catch Monday Night
Football at Porky's Backyard!"; the rest carry none. Karaoke, Social Saturdays and
Monday Night Football are not on the operations calendar at all for Nov or Dec — they
are extended from the October public entries on the owner's instruction.

## Fridays — line dancing on the 1st and 3rd, Latin Night on the 2nd and 4th

| Date | Title | Time |
|---|---|---|
| Fri Nov 6 | Line Dancing Night with Mizz CeCe & DJ TNT | 6:00 pm – 10:00 pm |
| Fri Nov 13 | Latin Night with JJ Villafane Band and DJ Chris Coke | 6:00 pm – 1:00 am |
| Fri Nov 20 | Line Dancing Night with Mizz CeCe & DJ TNT | 6:00 pm – 10:00 pm |
| Fri Nov 27 | Latin Night with JJ Villafane Band and DJ Chris Coke | 6:00 pm – 1:00 am |
| Fri Dec 4 | Line Dancing Night with Mizz CeCe & DJ TNT | 6:00 pm – 10:00 pm |
| Fri Dec 11 | Latin Night with DJ Chris Coke | 6:00 pm – 1:00 am |
| Fri Dec 18 | Line Dancing Night with Mizz CeCe & DJ TNT | 6:00 pm – 10:00 pm |

7 events. Chris Coke is not on the line dancing nights — the two standalone `DJ Chris
Coke` sets that revision 1 had on Nov 6 and Dec 4 were removed on the owner's word that
he does not play them. He stays on the Latin Nights, a separate booking.

Nov 20 and Dec 18 are all-day on the operations calendar, titled only "Line Dancing",
with no host named. Both are given the Mizz CeCe & DJ TNT title and 6–10 pm on the
owner's statement that they run "just like the other 1st and 3rd Fridays". **Correct
these two if that is wrong — it is the one inference left in this draft.**

Performer pay ($350 each to Cecily Jones and Tanganika Bryant), "check payable to
Christopher Jackson" and the promo/stage-cleaning to-dos are dropped. Titles cleaned:
stray `)` removed from the line dancing title; the Nov 13 internal spelling "JJ
Villifane" normalised to "Villafane" to match the Oct 23 public entry. The separate
all-day `JJ Villafane Band` entries on Nov 13 and Nov 27 are merged into those nights'
titles rather than listed twice.

## Thursdays — booked acts only

| Date | Title | Time |
|---|---|---|
| Thu Nov 5 | Live Music Thursday: Crystal Method | 7:00 pm – 11:00 pm |
| Thu Nov 12 | Live Music Thursday: Fal Skye | 7:00 pm – 11:00 pm |
| Thu Dec 3 | Live Music Thursday: Mike and Dixie Dollens | 7:00 pm – 11:00 pm |

3 events. Dollens' "$500 / check made to Michael Dollens" dropped. Dec 3 is all-day
internally; 7–11 pm copied from the other two and from the Oct 29 public entry.

## All-day one-offs

| Date | Title |
|---|---|
| Sun Nov 1 | Día de los Muertos |
| Sat Dec 12 | Santa's Workshop with the Houston Livestock Show & Rodeo |

2 events. Nov 1's internal title was `Dia De Los Muertos - Need Drink specials and
Crystal to support`; the staff to-do is dropped and the accents added. Dec 12's internal
location, "full play ground", is not carried over — say the word if it should be.

---

## Left off on purpose — 2 private rentals

| Date | Internal entry | Why |
|---|---|---|
| Sat Nov 7 | Upstairs reservation – ADD MOCKTAIL MOBILE BAR – DECA High school club | Private booking. Description holds the organiser's **name and personal cell number**. |
| Fri Dec 4 | Whispering Pines Elementary School Holiday Get Together | Private booking, 75 people upstairs. Description holds the organiser's **name and personal cell number**. |

Room rentals, not events the public is invited to, and publishing them would put a
private individual's phone number on the open web. If either is meant to be public, it
can be added — with the contact details stripped either way.

## Already on `PUBLIC - Porky's Events` — no action

The eight Texans game days: Nov 8, Nov 15, Nov 19, Nov 29, Dec 6, Dec 13, Dec 20,
Dec 24. They overlap Football Sundays, exactly as they did in October.

---

## Verification

`porkys-nov-dec-2026.ics` was parsed back through the site's own
`parseICS` / `expandRule` and expanded over Nov 1 – Dec 31:

```
VEVENTs parsed: 17
unsupported rules: 0
TOTAL OCCURRENCES: 56      by month: { Nov: 30, Dec: 26, OTHER: 0 }
```

Every occurrence landed on its intended weekday, nothing spilled outside the two months,
and the two all-day events resolved to Sun Nov 1 and Sat Dec 12 rather than slipping a
day — the noon-pinning in `parseDateValue` behaving as documented. `npm test` passes
22/22 untouched.

## How to apply this

**The write from the session was blocked.** The Google Calendar connector has read
access but not write: all five create calls failed with a missing-permission error and
**nothing was created** — re-checked afterwards, and Nov 1–8 on the public calendar
still holds only the pre-existing Texans game.

Two ways to finish:

1. **Import the file.** Google Calendar → Settings → Import & export → import
   `porkys-nov-dec-2026.ics` into `PUBLIC - Porky's Events`. Does all 56 in one action
   and needs no permission change. Note Google expands the five recurring series on
   import, so check it landed as series rather than loose copies.
2. **Grant write access** at <https://claude.ai/customize/connectors>, then start a new
   session — connectors are read at session start, so reconnecting mid-session will not
   pick it up. Then the events can be created directly.

Either way **no code change and no deploy is needed**: `src/lib/events.ts:50` reads the
live ICS feed, so the page is whatever the calendar says at build time. The 120-day
`WINDOW_DAYS` window reaches into February and the month grid pages three months
forward, so all of November and December render.

---

## Still open

**Five Thursdays have no act booked** — Nov 19, Nov 26 (Thanksgiving), Dec 10, Dec 17,
Dec 24 (Christmas Eve), Dec 31 (New Year's Eve). Live Music Thursday ran weekly in
October. No entries invented for these; if the nights are running they need acts.

**Holiday hours.** Thanksgiving, Christmas Eve and New Year's Eve sit empty here, and
Christmas Day is deliberately clear. Nothing on either calendar says whether the park is
open. Worth settling before December.

**Two recurring problems at the source.** Both corrections made in review will come back
next month unless the operations calendar is fixed: the pay-and-stage description is
pasted onto every Chris Coke entry, which is what made the Friday times ambiguous; and
the Latin Night rule (`4dd0nq81rrs5dljmo00a6hus6e`) has no Christmas exception, so it
will generate a Dec 25 event again.

**The site still has no real-calendar note in CLAUDE.md.** Its "Still open" section says
the calendar is `TestEventsCalendar` with one `TestEvent`; it is now
`PUBLIC - Porky's Events` with a real schedule. Worth updating.

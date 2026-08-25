# porkysbackyardevents

Events calendar for **Porky's Backyard**, a food truck park and bar at 5131
Atascocita Road, Humble, TX 77346. Sister site to porkysbackyard.com, which is
hosted on Toast and is **not** in this repo.

One page. Its single job: answer "what's on at Porky's, and when."

## Stack

- **Astro 7**, `output: 'static'`, one route.
- **Cloudflare Pages**, deployed from GitHub on push to `main` — same pattern as
  `conroebc` and `timberforestbp`.
- One **Pages Function**, `functions/api/events.ts`, proxying the calendar feed.
- Node lives at `~/.local/node` on the primary dev box and is not on `PATH`.
  Use `scripts/dev.sh` (4326) and `scripts/preview.sh` (4327), which find it.

Ports taken at `~/Dev`: 8000 dad_car_tracker, 4321 conroebc, 4322/4323
timberforestbp, 4324/4325 atascocitastowandgo, 4326/4327 here.

## Where the events come from

The **public ICS feed**, not the Google Calendar API:

```
https://calendar.google.com/calendar/ical/<id>/public/basic.ics
```

**This was a deliberate trade.** The API's `singleEvents=true` expands
recurrence rules server-side and would make `src/lib/ics.ts` unnecessary — but
it needs an API key, a Google Cloud project, and quota to manage. The ICS feed
needs no credential at all, so this site has nothing to rotate and no project
that can lapse. The price is that **recurrence expansion is our problem**,
which is why `ics.ts` has a real test suite and why you must not treat it as
throwaway code.

The calendar id is committed in `src/lib/config.ts` rather than kept only in an
environment variable, so a fresh deploy works with no dashboard setup. That is
safe **only because this calendar is public** — its id is in the embed URL and
every event on it is going onto this page anyway. `GOOGLE_CALENDAR_ID` still
overrides it. **If the calendar is ever made private, delete the default** —
the id becomes a capability at that point.

Run the tests before touching anything in `ics.ts` or `events.ts`:

```bash
npm test
```

## Design system — ported, not invented

Every colour in `src/styles/tokens.css` was read out of the live
porkysbackyard.com stylesheet on 2026-08-24. Toast exposes its palette as
`--ds-*` custom properties; the Toast name sits in a comment beside each token.

- Red `#ff1e02`, cream `#fff8f6`, ink `#202020`, rule `#cecece`.
- Cyan `#28eaff` is defined by Toast and barely used on the main site. **Here it
  means "now" and nothing else** — the today chip and the today cell. Never
  colour an event with it.
- **Chewy** carries every heading and button label, as on the main site. It
  ships one weight; asking for 700 only synthesises a fake bold.
- **Inter** replaces Effra, which is licensed and not ours to serve.

**Nothing may hardcode a colour or a font size.** Add a token. The owner has
discarded whole palettes on sibling projects; the token layer is why those
redesigns were cheap.

## The one risky decision

The hero is a band of red corrugated metal — a repeating gradient, no image —
because the park's building is red corrugated metal with marquee letters across
it. It carries a white card leading with the **next event**, not a headline.
Someone opening this at 5pm on a Friday wants one fact.

If that band is ever flattened into a plain red rectangle, the page loses the
only thing that makes it specific to this venue.

## Gotchas

1. **All-day events are pinned to noon**, not midnight. `20260826` parsed as
   midnight is 7pm on the 25th in Central time, so an all-day Saturday event
   renders as Friday. `parseDateValue` handles this; do not "simplify" it.
2. **Everything renders in `America/Chicago`**, never the visitor's zone. A
   customer in another timezone still needs to know when to turn up in Humble.
3. **Recurrence steps in wall-clock time, not fixed 24-hour jumps.** A 6pm
   weekly event must stay at 6pm across the November DST change. There is a
   test for exactly this.
4. **`expandRule` fast-forwards to the requested window** when a rule is
   unbounded. Without it, a weekly night created in 2019 burns its whole
   iteration budget walking through the past and silently stops appearing.
   The skip is disabled for `COUNT` rules, because COUNT is measured from the
   series start.
5. **Unsupported rules are reported, not swallowed.** `BYSETPOS` and friends
   are not expanded; those land in `ParseResult.unsupported`, the build logs a
   warning, and `/api/events` returns them in the payload. If a recurring night
   goes missing, look there first.
6. **`RECURRENCE-ID` overrides replace an occurrence.** Google publishes "bingo
   moved to 7pm this one week" as a second VEVENT with the same UID. Without
   the override map it would show twice, at six and at seven.
7. **Calendar text is untrusted.** It reaches the page through `innerHTML`.
   `render.ts` escapes every interpolated string via `esc()` and drops any href
   that is not http(s). If you add a field, escape it there — not at the call
   site.
8. **The two JSON `<script>` blocks go through `safeJson()`**, which escapes
   `<`. Without it an event titled `</script>` ends the block and dumps the
   feed into the document as markup.
9. **A failed feed fails the build.** There is deliberately no placeholder
   fallback: a broken build keeps the last good deploy serving, where a
   fallback would replace a real schedule with a page that reads "nothing
   scheduled". A 404 from the ICS feed almost always means the calendar was
   switched back to private.
10. **The month grid pages three months forward, no further**, matching the
    120-day `WINDOW_DAYS` feed. A fourth month would render empty and read as
    "nothing booked" rather than "not loaded".
11. **`/api/events` returning 404 is deliberately silent** on the client — it
    means the Function is not deployed, which is also every local
    `astro preview` run. Only other failures warn, because a page that cries
    wolf gets ignored when the warning is real.
12. **`astro preview` serves a stale build if you rebuild underneath it.**
    `scripts/preview.sh` rebuilds first; still stop and restart after changes.
    To exercise the Function locally you need wrangler, not astro preview:
    `npx wrangler pages dev dist --port 8788`.
13. **`functions/` has its own tsconfig.** It runs on workerd, and
    `@cloudflare/workers-types` collides with the DOM lib the Astro config
    pulls in. The root tsconfig excludes it; the Workers one excludes the
    tests, which need Node globals. Check with
    `npx tsc -p functions/tsconfig.json`.
14. **The mobile month rules are scoped `.month td…`, not `.cell…`,** on
    purpose. The table reset needs element selectors, and `.cell` (0,1,0) loses
    to `.month td` (0,1,1). This already caused one silently wrong layout.

## Assets

`photos/porkys-logo-original.png` is the supplied 4000×4000 master. Everything
in `public/` is derived from it with `sips` — regenerate from the master rather
than upscaling a derivative:

```bash
sips -Z 320 photos/porkys-logo-original.png --out public/logo.png
```

## Still open

- **The calendar is a test calendar.** As of 2026-08-25 it is named
  `TestEventsCalendar` and holds one event, `TestEvent`. Point
  `src/lib/config.ts` at the real one when it exists.
- **No photography.** The hero is type on a gradient. If photos arrive, the
  band can take one behind the corrugation.
- **Event links and images.** `PorkyEvent.link` picks up the first URL in a
  description and renders a "Details" button. Whether the venue actually writes
  links or flyer images into descriptions is unconfirmed, so there is no image
  slot yet.

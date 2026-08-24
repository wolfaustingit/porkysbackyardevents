# porkysbackyardevents

Events calendar for **Porky's Backyard**, a food truck park and bar at 5131
Atascocita Road, Humble, TX 77346. Sister site to porkysbackyard.com, which is
hosted on Toast and is **not** in this repo.

One page. Its single job: answer "what's on at Porky's, and when."

## Stack

- **Astro 7**, `output: 'static'`, one route.
- **Cloudflare Pages**, deployed from GitHub on push to `main` — same pattern as
  `conroebc` and `timberforestbp`.
- A single **Pages Function** at `functions/api/events.ts` keeps the Google API
  key off the client.
- Node lives at `~/.local/node` on the primary dev box and is not on `PATH`.
  Use `scripts/dev.sh` (port 4326) and `scripts/preview.sh` (port 4327), which
  find it themselves.

Ports already taken at `~/Dev`: 8000 dad_car_tracker, 4321 conroebc, 4322/4323
timberforestbp, 4324/4325 atascocitastowandgo.

## Design system — ported, not invented

Every colour in `src/styles/tokens.css` was read out of the live
porkysbackyard.com stylesheet on 2026-08-24. Toast exposes its palette as
`--ds-*` custom properties; the Toast name is in a comment beside each token so
a future change can be traced to source.

- Red `#ff1e02`, cream `#fff8f6`, ink `#202020`, rule `#cecece`.
- Cyan `#28eaff` is defined by Toast and barely used on the main site. **Here it
  means "now" and nothing else** — the today chip, the today cell, and nothing
  more. Never colour an event with it.
- **Chewy** carries every heading and button label, exactly as on the main site.
  It ships one weight; asking for 700 only synthesises a fake bold.
- **Inter** replaces Effra, which is licensed and not ours to serve.

**Nothing may hardcode a colour or a font size.** Add a token. The owner has
discarded whole palettes on sibling projects, and the token layer is why those
redesigns were cheap.

## The one risky decision

The hero is a band of red corrugated metal — a repeating gradient, no image —
because the park's building is red corrugated metal with marquee letters across
it. It carries a white card that leads with the **next event**, not a headline.
Someone opening this at 5pm on a Friday wants one fact.

If that band ever gets softened into a flat red rectangle, the page loses the
only thing that makes it specific to this venue.

## Configuration

Two variables, both required in production:

```
GOOGLE_CALENDAR_ID=…@group.calendar.google.com
GOOGLE_CALENDAR_API_KEY=…
```

- Set both as **build environment variables** in Cloudflare (the page bakes the
  schedule in at build time) **and** `GOOGLE_CALENDAR_API_KEY` as a **secret**
  for the Function.
- The calendar must be **public** (Google Calendar → Settings → Access
  permissions → "Make available to public").
- The key is a Google Cloud API key with the Calendar API enabled. It is never
  sent to the browser — the Function holds it. Restrict it to the Calendar API.

**If the variables are unset the site renders `src/data/sample.ts` and prints a
visible "Placeholder schedule" notice.** Those events are invented. The notice
is the only thing standing between placeholder data and a customer driving out
to a bingo night that does not exist — do not remove it, and do not style it
down.

## Gotchas

1. **`singleEvents=true` is not optional.** It makes Google expand recurrence
   rules server-side, so weekly bingo arrives as N dated events. Remove it and
   the page shows one event where there should be twelve.
2. **All-day events are `YYYY-MM-DD`.** Parsing that with `new Date()` lands on
   UTC midnight, which in Humble is the previous evening — an all-day Saturday
   event renders as Friday. `toDate()` pins them to noon. Use it.
3. **Everything renders in `America/Chicago`**, never the visitor's zone. A
   customer in another timezone still needs to know when to show up in Humble.
4. **Calendar text is untrusted.** It reaches the page through `innerHTML`.
   `render.ts` escapes every interpolated string via `esc()` and drops any href
   that is not http(s). If you add a field, escape it there — not at the call
   site.
5. **The two JSON `<script>` blocks are escaped with `safeJson()`**, which turns
   every `<` into a `<` escape. Without it an event titled `</script>`
   ends the block and dumps the rest of the feed into the document as markup.
6. **The month grid pages three months forward, no further**, because the feed
   only covers `WINDOW_DAYS` (120). A fourth month would render empty and read
   as "nothing booked" rather than "not loaded".
7. **`/api/events` returning 404 or 503 is deliberately silent.** 503 means
   unconfigured, 404 means the Function is not deployed — which is also every
   local `astro preview` run. Only other failures warn, because a page that
   cries wolf about a stale schedule gets ignored when it is actually stale.
8. **`astro preview` serves a stale build if you rebuild underneath it.**
   `scripts/preview.sh` rebuilds first; still stop and restart it after changes.
9. **`functions/` has its own tsconfig.** It runs on workerd, and
   `@cloudflare/workers-types` collides with the DOM lib the Astro config pulls
   in. The root tsconfig excludes it. Check it with
   `npx tsc -p functions/tsconfig.json`.
10. **The mobile month rules are scoped `.month td…`, not `.cell…`,** on
    purpose. The table reset needs element selectors, and `.cell` (0,1,0) loses
    to `.month td` (0,1,1). This already caused one silently wrong layout.

## Still open

- **The logo is a placeholder.** `.brand-mark` is a black disc with a "P", and
  `public/favicon.svg` matches it. The main site serves its roundel at 186px
  webp, too small to reuse. Replace both when a high-resolution file arrives.
- **No photography.** The hero is type on a gradient. If photos arrive, the band
  can take one behind the corrugation.
- **Event links and images.** `PorkyEvent.link` picks up the first URL in a
  description and renders a "Details" button. Whether the venue actually writes
  links or flyer images into descriptions has not been confirmed, so no image
  slot exists yet.

# porkysbackyardevents

Live events calendar for **Porky's Backyard** (5131 Atascocita Road, Humble, TX
77346) — a sister site to [porkysbackyard.com](https://porkysbackyard.com).

One page, two views: an upcoming list and a month grid. The schedule comes from
the venue's public Google Calendar — baked into the HTML at build time so the
page works without JavaScript, then refreshed live at the edge.

Astro, static output, deployed to Cloudflare from `main`.

## Running it

Node is not on the default PATH on the primary dev box, so the scripts find it
themselves.

```bash
npm install
```

```bash
./scripts/dev.sh
```

Dev runs on 4326. `./scripts/preview.sh` builds and serves the built output on
4327 — use that for Lighthouse, never the dev server.

`astro preview` does not run Cloudflare Functions, so `/api/events` 404s there
and the page falls back to its baked-in schedule. To exercise the live path:

```bash
npx wrangler pages dev dist --port 8788
```

## Tests

`src/lib/ics.ts` parses iCalendar and expands recurrence rules itself, because
the public ICS feed needs no API key where the Calendar API would. That makes
the test suite load-bearing, not decorative — a wrong expansion publishes the
wrong night.

```bash
npm test
```

## Configuration

None required. The calendar id is committed in `src/lib/config.ts`, which is
safe because the calendar is public. Set `GOOGLE_CALENDAR_ID` to override it.

If the calendar is ever made private, remove the committed default and set the
id as an environment variable in Cloudflare instead.

`CLAUDE.md` is the authority on the design system and the gotchas. Read it
before changing anything.

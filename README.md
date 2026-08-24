# porkysbackyardevents

Live events calendar for **Porky's Backyard** (5131 Atascocita Road, Humble, TX
77346) — a sister site to [porkysbackyard.com](https://porkysbackyard.com).

One page, two views: an upcoming list and a month grid. The schedule comes from
a public Google Calendar, baked into the HTML at build time and refreshed live
at the edge.

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
4327 — use that for Lighthouse and any automated checking, never the dev server.

## Configuration

Copy `.env.example` to `.env` and fill in both values:

```
GOOGLE_CALENDAR_ID=…@group.calendar.google.com
GOOGLE_CALENDAR_API_KEY=…
```

Both must also be set in Cloudflare — as build environment variables, and the
key additionally as a secret so the `/api/events` Function can read it. The API
key is never sent to the browser.

**Without them the site renders placeholder events and says so on the page.**

`CLAUDE.md` is the authority on the design system and the gotchas. Read it
before changing anything.

/*
 * GET /api/events — the live feed the page refreshes against.
 *
 * This exists so the Google API key never reaches a browser. A referrer-
 * restricted browser key would technically work, but referrer restrictions are
 * trivially spoofed and the key would sit in the HTML of a public site
 * forever. It stays a Cloudflare secret and only this function sees it.
 *
 * Deployed as a Cloudflare Pages Function: the `functions/` directory at the
 * repo root is picked up automatically alongside the static `dist` output.
 */

import {
  calendarUrl,
  normalise,
  windowFrom,
  type PorkyEvent,
} from "../../src/lib/events";

interface Env {
  /** The `...@group.calendar.google.com` id of the public events calendar. */
  GOOGLE_CALENDAR_ID: string;
  /** A Google Cloud API key with the Calendar API enabled. Secret. */
  GOOGLE_CALENDAR_API_KEY: string;
}

/**
 * Five minutes. Long enough that a busy Saturday does not hammer Google's
 * quota, short enough that a same-day schedule fix reaches the sign-out front
 * before anyone notices it was wrong.
 */
const EDGE_TTL = 300;

function json(body: unknown, status: number, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=60, s-maxage=${EDGE_TTL}`,
      ...extra,
    },
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const { GOOGLE_CALENDAR_ID: id, GOOGLE_CALENDAR_API_KEY: key } = env;

  if (!id || !key) {
    // Misconfiguration is the likeliest failure here, and a silent empty list
    // looks identical to "no events this month". Say which one it is.
    return json(
      { error: "calendar_not_configured", events: [] },
      503,
      { "cache-control": "no-store" },
    );
  }

  const upstream = calendarUrl(id, key, windowFrom(new Date()));

  let res: Response;
  try {
    res = await fetch(upstream, {
      // Cloudflare's own cache in front of Google, independent of the
      // response headers we hand our visitors.
      cf: { cacheTtl: EDGE_TTL, cacheEverything: true },
    });
  } catch {
    return json({ error: "upstream_unreachable", events: [] }, 502, {
      "cache-control": "no-store",
    });
  }

  if (!res.ok) {
    // Do not echo Google's body — it repeats the API key back in some error
    // shapes, and this response is public.
    return json(
      { error: "upstream_error", status: res.status, events: [] },
      502,
      { "cache-control": "no-store" },
    );
  }

  const payload = (await res.json()) as { items?: unknown[] };
  const events: PorkyEvent[] = normalise((payload.items ?? []) as never[]);

  return json(
    { events, fetchedAt: new Date().toISOString() },
    200,
    { "access-control-allow-origin": new URL(request.url).origin },
  );
};

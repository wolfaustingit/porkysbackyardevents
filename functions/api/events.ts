/*
 * GET /api/events — the live feed the page refreshes against.
 *
 * The upstream is Google's public ICS feed, which needs no credential at all.
 * This function still exists rather than having the browser fetch Google
 * directly, for two reasons: the ICS endpoint sends no CORS headers, so a
 * browser fetch would fail outright; and proxying lets Cloudflare cache one
 * copy at the edge instead of every visitor hitting Google.
 *
 * Deployed as a Cloudflare Pages Function: the `functions/` directory at the
 * repo root is picked up automatically alongside the static `dist` output.
 */

import { resolveCalendarId } from "../../src/lib/config";
import { fromICS, icsUrl, type PorkyEvent } from "../../src/lib/events";

interface Env {
  /** Optional override; falls back to the committed public calendar id. */
  GOOGLE_CALENDAR_ID?: string;
}

/**
 * Five minutes. Long enough that a busy Saturday does not hammer Google,
 * short enough that a same-day schedule fix reaches the page before anyone
 * notices it was wrong.
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
  const id = resolveCalendarId(env.GOOGLE_CALENDAR_ID);

  let res: Response;
  try {
    res = await fetch(icsUrl(id), {
      // Cloudflare's own cache in front of Google, independent of the headers
      // we hand our visitors.
      cf: { cacheTtl: EDGE_TTL, cacheEverything: true },
    });
  } catch {
    return json({ error: "upstream_unreachable", events: [] }, 502, {
      "cache-control": "no-store",
    });
  }

  if (!res.ok) {
    // A 404 here almost always means the calendar was switched back to
    // private rather than that the id is wrong — it is the one failure worth
    // being able to recognise later from logs alone.
    return json({ error: "upstream_error", status: res.status, events: [] }, 502, {
      "cache-control": "no-store",
    });
  }

  const { events, unsupported } = fromICS(await res.text(), new Date());
  const list: PorkyEvent[] = events;

  return json(
    {
      events: list,
      fetchedAt: new Date().toISOString(),
      // Rules we could not fully expand. Not rendered, but present so a
      // missing recurring night can be diagnosed without guessing.
      ...(unsupported.length ? { unsupported } : {}),
    },
    200,
    { "access-control-allow-origin": new URL(request.url).origin },
  );
};

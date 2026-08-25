/*
 * The event model, and the one place raw calendar data becomes it.
 *
 * The build and the Cloudflare Function both normalise through here, so the
 * server render and the live refresh can never disagree about shape.
 */

import { expandRule, parseICS, type ParseResult, type RawEvent } from "./ics";

export interface PorkyEvent {
  /** Stable across refreshes — UID plus occurrence, so recurring nights differ. */
  id: string;
  title: string;
  /** Description with any trailing link stripped out; may be empty. */
  description: string;
  /** ISO 8601 instant. */
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  /** First URL found in the description, surfaced as the row's CTA. */
  link: string | null;
}

/** The park is in Humble, TX. Every date on this site is rendered in its time. */
export const VENUE_TZ = "America/Chicago";

/** How far forward the site looks. A season of events, not an archive. */
export const WINDOW_DAYS = 120;

/** How far back — so an event still running today does not vanish at 12:01am. */
export const LOOKBACK_HOURS = 12;

export function windowFrom(now: Date): { from: number; to: number } {
  return {
    from: now.getTime() - LOOKBACK_HOURS * 3600_000,
    to: now.getTime() + WINDOW_DAYS * 86400_000,
  };
}

/**
 * The public ICS feed.
 *
 * No API key, no Google Cloud project, no quota — the calendar just has to be
 * public. The cost is that recurrence expansion is ours to do; see ics.ts.
 */
export function icsUrl(calendarId: string): string {
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(
    calendarId,
  )}/public/basic.ics`;
}

const URL_RE = /https?:\/\/[^\s<>"')]+/i;

/**
 * Descriptions arrive as HTML about half the time, because Google lets people
 * paste rich text in. Strip tags rather than rendering them — we own the
 * calendar, but it is still an authoring surface, not trusted markup.
 */
function toPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function build(raw: RawEvent, startMs: number): PorkyEvent {
  const text = toPlainText(raw.description);
  const link = text.match(URL_RE)?.[0] ?? null;
  // Pull the bare URL out of the prose so the row does not print it twice —
  // once as text and once as the button.
  const description = link ? text.replace(link, "").trim() : text;

  return {
    id: `${raw.uid}|${startMs}`,
    title: raw.summary || "Untitled event",
    description,
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + raw.duration).toISOString(),
    allDay: raw.allDay,
    location: raw.location,
    link,
  };
}

export interface FeedResult {
  events: PorkyEvent[];
  /** Recurrence rules this parser could not fully expand. Surface, don't hide. */
  unsupported: ParseResult["unsupported"];
}

/**
 * ICS text → the events falling inside the window, recurrences expanded and
 * single-instance edits applied.
 */
export function fromICS(text: string, now: Date): FeedResult {
  const { events: raw, unsupported } = parseICS(text);
  const { from, to } = windowFrom(now);

  /*
   * Google publishes an edited instance of a recurring series as a separate
   * VEVENT carrying RECURRENCE-ID — same UID, pointing at the occurrence it
   * replaces. Without this map, "bingo moved to 7pm this one week" would show
   * twice: once at six and once at seven.
   */
  const overrides = new Map<string, RawEvent>();
  for (const e of raw) {
    if (e.recurrenceId !== null) {
      overrides.set(`${e.uid}|${e.recurrenceId}`, e);
    }
  }

  const out: PorkyEvent[] = [];

  for (const base of raw) {
    if (base.recurrenceId !== null) continue; // handled as an override
    if (base.status === "CANCELLED") continue;

    for (const startMs of expandRule(base, VENUE_TZ, from, to)) {
      const override = overrides.get(`${base.uid}|${startMs}`);
      if (override) {
        if (override.status === "CANCELLED") continue;
        out.push(build(override, override.start));
      } else {
        out.push(build(base, startMs));
      }
    }
  }

  // An override can also move an instance *into* the window from outside it,
  // in which case the loop above never reached it.
  for (const [key, o] of overrides) {
    if (o.status === "CANCELLED") continue;
    if (o.start < from || o.start > to) continue;
    if (out.some((e) => e.id === `${o.uid}|${o.start}`)) continue;
    // Only if its series is present at all — a stray override is not an event.
    if (!raw.some((r) => r.uid === o.uid && r.recurrenceId === null)) continue;
    void key;
    out.push(build(o, o.start));
  }

  out.sort((a, b) => a.start.localeCompare(b.start));
  return { events: out, unsupported };
}

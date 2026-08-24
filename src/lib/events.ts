/*
 * The event model, and the one place raw Google Calendar payloads become it.
 *
 * Both the Cloudflare Function (live, at the edge) and the Astro build (the
 * first paint, baked into HTML) normalise through `normalise()`, so the server
 * render and the client refresh can never disagree about shape.
 */

export interface PorkyEvent {
  /** Google's event id — stable across refreshes, used as the render key. */
  id: string;
  title: string;
  /** Description with any trailing link stripped out; may be empty. */
  description: string;
  /** ISO 8601. All-day events carry a date only; see `allDay`. */
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  /** First URL found in the description, surfaced as the row's CTA. */
  link: string | null;
}

/** The shape Google returns from calendar/v3/events. Only what we read. */
interface GoogleEvent {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

const URL_RE = /https?:\/\/[^\s<>"')]+/i;

/**
 * Google lets people paste rich text into descriptions, so they arrive as
 * HTML about half the time. Strip tags and entities rather than rendering
 * them — this text goes into the page and the calendar is not a trusted
 * authoring surface just because we own it.
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

function normaliseOne(raw: GoogleEvent): PorkyEvent | null {
  const start = raw.start?.dateTime ?? raw.start?.date;
  if (!raw.id || !start) return null;

  const allDay = !raw.start?.dateTime;
  const end = raw.end?.dateTime ?? raw.end?.date ?? start;

  const text = toPlainText(raw.description ?? "");
  const link = text.match(URL_RE)?.[0] ?? null;
  // Pull the bare URL out of the prose so the row does not print the link
  // twice — once as text and once as the button.
  const description = link ? text.replace(link, "").trim() : text;

  return {
    id: raw.id,
    title: (raw.summary ?? "Untitled event").trim(),
    description,
    start,
    end,
    allDay,
    location: (raw.location ?? "").trim(),
    link,
  };
}

export function normalise(items: GoogleEvent[]): PorkyEvent[] {
  return items
    .filter((e) => e.status !== "cancelled")
    .map(normaliseOne)
    .filter((e): e is PorkyEvent => e !== null)
    .sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Build the Calendar API request.
 *
 * `singleEvents` is the important one: it expands RRULEs server-side, so a
 * weekly trivia night arrives as N dated events instead of one recurrence rule
 * this codebase would have to expand itself. Do not remove it.
 */
export function calendarUrl(
  calendarId: string,
  apiKey: string,
  opts: { timeMin: string; timeMax: string; max?: number },
): string {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId,
    )}/events`,
  );
  url.searchParams.set("key", apiKey);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", opts.timeMin);
  url.searchParams.set("timeMax", opts.timeMax);
  url.searchParams.set("maxResults", String(opts.max ?? 250));
  url.searchParams.set("timeZone", VENUE_TZ);
  return url.toString();
}

/** The park is in Humble, TX. Every date on this site is rendered in its time. */
export const VENUE_TZ = "America/Chicago";

/** How far forward the site looks. A season of events, not an archive. */
export const WINDOW_DAYS = 120;

/** How far back — so an event still showing today does not vanish at 12:01am. */
export const LOOKBACK_HOURS = 12;

export function windowFrom(now: Date): { timeMin: string; timeMax: string } {
  const min = new Date(now.getTime() - LOOKBACK_HOURS * 3600_000);
  const max = new Date(now.getTime() + WINDOW_DAYS * 86400_000);
  return { timeMin: min.toISOString(), timeMax: max.toISOString() };
}

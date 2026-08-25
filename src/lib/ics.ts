/*
 * iCalendar parsing and recurrence expansion.
 *
 * WHY THIS EXISTS INSTEAD OF THE GOOGLE CALENDAR API
 *
 * The Calendar API's `singleEvents=true` would expand recurrence rules
 * server-side and this file would not be needed — but it requires an API key,
 * a Google Cloud project, and quota management. The public ICS feed needs
 * none of that, so the site has no credential to rotate and no project to
 * keep alive.
 *
 * The trade is that recurrence expansion becomes our problem, and a venue
 * that publishes the wrong night is a real cost. Hence: the supported subset
 * is stated explicitly below, anything outside it is reported rather than
 * silently dropped, and every rule here is covered by tests in ics.test.ts.
 *
 * SUPPORTED: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, COUNT, UNTIL,
 * BYDAY (with and without an ordinal prefix, e.g. MO or 3TH or -1FR),
 * BYMONTHDAY, EXDATE, and RECURRENCE-ID overrides.
 *
 * NOT SUPPORTED: BYSETPOS, BYWEEKNO, BYYEARDAY, BYHOUR/BYMINUTE. A rule using
 * any of these still yields its first occurrence and is listed in
 * `unsupported` so the caller can surface it rather than quietly losing dates.
 */

/** One VEVENT, before recurrence is expanded. */
export interface RawEvent {
  uid: string;
  summary: string;
  description: string;
  location: string;
  /** Epoch ms of the first occurrence. */
  start: number;
  /** Duration in ms, carried forward to every occurrence. */
  duration: number;
  allDay: boolean;
  status: string;
  rrule: string | null;
  /** Epoch ms of each EXDATE. */
  exdates: number[];
  /** Set when this VEVENT overrides one instance of a recurring series. */
  recurrenceId: number | null;
  sequence: number;
}

export interface ParseResult {
  events: RawEvent[];
  /** UID + rule for any RRULE this parser cannot fully expand. */
  unsupported: Array<{ uid: string; rule: string; reason: string }>;
}

/* ------------------------------------------------------------- timezones */

/**
 * Offset of `tz` from UTC at a given instant, in ms.
 *
 * Formatting the instant in the target zone and reading it back as if it were
 * UTC gives the offset, which is the only way to do this without shipping a
 * timezone database.
 */
function tzOffset(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(new Date(utcMs))
    .reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - utcMs;
}

/**
 * Wall-clock time in `tz` → epoch ms.
 *
 * Applied twice because the offset depends on the instant we are still
 * solving for: near a DST boundary the first guess can land on the wrong side
 * of the transition, and the second pass corrects it.
 */
function zonedToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  tz: string,
): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const corrected = guess - tzOffset(guess, tz);
  return guess - tzOffset(corrected, tz);
}

/* ---------------------------------------------------------------- parsing */

/**
 * Undo RFC 5545 line folding: a CRLF followed by a space or tab is a
 * continuation, not a new property. Google folds at 75 octets, so any long
 * description arrives folded.
 */
function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n")
    .filter((l) => l.length > 0);
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseProp(line: string): Prop | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;

  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(";");

  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq === -1) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value };
}

/** RFC 5545 TEXT escaping. Order matters: backslash last. */
function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/**
 * A DATE or DATE-TIME value → epoch ms.
 *
 * All-day values (`20260826`) are pinned to noon in the venue zone. Midnight
 * would sit one UTC day earlier for any zone west of Greenwich, which is
 * exactly how an all-day Saturday event ends up rendering as Friday.
 */
export function parseDateValue(
  prop: Prop,
  defaultTz: string,
): { ms: number; allDay: boolean } {
  const v = prop.value.trim();

  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    return {
      ms: zonedToUtc(+y, +mo, +d, 12, 0, 0, defaultTz),
      allDay: true,
    };
  }

  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!dt) return { ms: NaN, allDay: false };

  const [, y, mo, d, h, mi, s, z] = dt;
  if (z) {
    return { ms: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s), allDay: false };
  }
  const tz = prop.params.TZID ?? defaultTz;
  return { ms: zonedToUtc(+y, +mo, +d, +h, +mi, +s, tz), allDay: false };
}

/** Default when a feed carries no X-WR-TIMEZONE. The park is in Humble, TX. */
const FALLBACK_TZ = "America/Chicago";

export function parseICS(text: string): ParseResult {
  const lines = unfold(text);
  const events: RawEvent[] = [];
  const unsupported: ParseResult["unsupported"] = [];

  let calTz = FALLBACK_TZ;
  let cur: Partial<RawEvent> & { exdates: number[] } = { exdates: [] };
  let endMs: number | null = null;
  let inEvent = false;

  for (const line of lines) {
    const prop = parseProp(line);
    if (!prop) continue;

    if (prop.name === "X-WR-TIMEZONE" && !inEvent) {
      calTz = prop.value.trim() || FALLBACK_TZ;
      continue;
    }

    if (prop.name === "BEGIN" && prop.value === "VEVENT") {
      inEvent = true;
      cur = { exdates: [] };
      endMs = null;
      continue;
    }

    if (prop.name === "END" && prop.value === "VEVENT") {
      inEvent = false;
      if (cur.start !== undefined && !Number.isNaN(cur.start)) {
        // No DTEND is legal; an all-day event is one day, a timed one is
        // instantaneous per RFC 5545. Neither should render as "ends now".
        const fallbackEnd = cur.allDay ? cur.start + 86400_000 : cur.start;
        events.push({
          uid: cur.uid ?? "",
          summary: cur.summary ?? "",
          description: cur.description ?? "",
          location: cur.location ?? "",
          start: cur.start,
          duration: Math.max(0, (endMs ?? fallbackEnd) - cur.start),
          allDay: cur.allDay ?? false,
          status: cur.status ?? "CONFIRMED",
          rrule: cur.rrule ?? null,
          exdates: cur.exdates,
          recurrenceId: cur.recurrenceId ?? null,
          sequence: cur.sequence ?? 0,
        });
      }
      continue;
    }

    if (!inEvent) continue;

    switch (prop.name) {
      case "UID":
        cur.uid = prop.value.trim();
        break;
      case "SUMMARY":
        cur.summary = unescapeText(prop.value).trim();
        break;
      case "DESCRIPTION":
        cur.description = unescapeText(prop.value).trim();
        break;
      case "LOCATION":
        cur.location = unescapeText(prop.value).trim();
        break;
      case "STATUS":
        cur.status = prop.value.trim().toUpperCase();
        break;
      case "SEQUENCE":
        cur.sequence = Number(prop.value) || 0;
        break;
      case "DTSTART": {
        const { ms, allDay } = parseDateValue(prop, calTz);
        cur.start = ms;
        cur.allDay = allDay;
        break;
      }
      case "DTEND": {
        endMs = parseDateValue(prop, calTz).ms;
        break;
      }
      case "RRULE":
        cur.rrule = prop.value.trim();
        break;
      case "RECURRENCE-ID":
        cur.recurrenceId = parseDateValue(prop, calTz).ms;
        break;
      case "EXDATE":
        // EXDATE may carry a comma-separated list on one line.
        for (const piece of prop.value.split(",")) {
          const { ms } = parseDateValue({ ...prop, value: piece }, calTz);
          if (!Number.isNaN(ms)) cur.exdates.push(ms);
        }
        break;
    }
  }

  for (const e of events) {
    const reason = unsupportedReason(e.rrule);
    if (reason) unsupported.push({ uid: e.uid, rule: e.rrule!, reason });
  }

  return { events, unsupported };
}

/* ------------------------------------------------------------- recurrence */

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Parts this expander ignores. Named so callers can report them honestly. */
const IGNORED_PARTS = ["BYSETPOS", "BYWEEKNO", "BYYEARDAY", "BYHOUR", "BYMINUTE"];

function unsupportedReason(rrule: string | null): string | null {
  if (!rrule) return null;
  const parts = ruleParts(rrule);
  const hit = IGNORED_PARTS.find((p) => p in parts);
  if (hit) return `${hit} is not expanded`;
  const freq = parts.FREQ;
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq ?? "")) {
    return `FREQ=${freq ?? "(missing)"} is not expanded`;
  }
  return null;
}

function ruleParts(rrule: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of rrule.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return out;
}

/** Guard against a malformed rule spinning forever. Four months of daily. */
const MAX_OCCURRENCES = 400;

/**
 * Expand one event's RRULE into occurrence start times within [from, to].
 *
 * Occurrences are stepped in the venue's wall-clock time, not in fixed 24-hour
 * jumps: a 6pm weekly event stays at 6pm across a DST change, which is what
 * "every Monday at six" means to everyone except a computer.
 */
export function expandRule(
  event: RawEvent,
  tz: string,
  from: number,
  to: number,
): number[] {
  if (!event.rrule) {
    return event.start >= from && event.start <= to ? [event.start] : [];
  }

  const parts = ruleParts(event.rrule);
  const freq = parts.FREQ;
  const interval = Math.max(1, Number(parts.INTERVAL) || 1);
  const count = parts.COUNT ? Number(parts.COUNT) : Infinity;
  const until = parts.UNTIL
    ? parseDateValue({ name: "UNTIL", params: {}, value: parts.UNTIL }, tz).ms
    : Infinity;

  // Wall-clock fields of DTSTART, so every generated occurrence keeps them.
  const w = wallParts(event.start, tz);
  const byDay = parts.BYDAY ? parts.BYDAY.split(",") : [];
  const byMonthDay = parts.BYMONTHDAY
    ? parts.BYMONTHDAY.split(",").map(Number)
    : [];

  const out: number[] = [];
  const push = (ms: number): boolean => {
    if (ms > until || out.length >= count) return false;
    if (ms >= from && ms <= to) out.push(ms);
    return true;
  };

  const make = (y: number, mo: number, d: number): number =>
    zonedToUtc(y, mo, d, w.hour, w.minute, w.second, tz);

  /*
   * Start iterating near the requested window instead of at DTSTART.
   *
   * Without this, a weekly event created years ago burns its whole
   * MAX_OCCURRENCES budget walking through the past and returns nothing for
   * today — a long-running bingo night would simply stop appearing, with no
   * error anywhere. Venues do keep recurring events for years.
   *
   * Only safe when the rule is unbounded: COUNT is measured from the series
   * start, so a COUNT rule has to be walked from the beginning. Those are
   * finite and short by definition, so walking them costs nothing.
   */
  const skipUnits = (unitMs: number): number =>
    count === Infinity && from > event.start
      ? Math.max(0, Math.floor((from - event.start) / unitMs) - 1)
      : 0;

  if (freq === "DAILY") {
    const first = skipUnits(interval * 86400_000);
    for (let i = first; i < first + MAX_OCCURRENCES; i++) {
      const base = new Date(Date.UTC(w.year, w.month - 1, w.day));
      base.setUTCDate(base.getUTCDate() + i * interval);
      const ms = make(
        base.getUTCFullYear(),
        base.getUTCMonth() + 1,
        base.getUTCDate(),
      );
      if (ms > to || ms > until) break;
      if (!push(ms)) break;
    }
  } else if (freq === "WEEKLY") {
    // With no BYDAY the rule repeats on DTSTART's own weekday.
    const days = byDay.length
      ? byDay.map((d) => DAY_CODES.indexOf(d.slice(-2)))
      : [new Date(event.start).getUTCDay()];
    const startWeekday = weekdayIn(event.start, tz);
    const weekStart = new Date(Date.UTC(w.year, w.month - 1, w.day));
    weekStart.setUTCDate(weekStart.getUTCDate() - startWeekday);

    const firstWeek = skipUnits(interval * 7 * 86400_000);
    outer: for (let wk = firstWeek; wk < firstWeek + MAX_OCCURRENCES; wk++) {
      for (const dow of days.slice().sort((a, b) => a - b)) {
        if (dow < 0) continue;
        const d = new Date(weekStart);
        d.setUTCDate(d.getUTCDate() + wk * interval * 7 + dow);
        const ms = make(
          d.getUTCFullYear(),
          d.getUTCMonth() + 1,
          d.getUTCDate(),
        );
        if (ms < event.start) continue;
        if (ms > to || ms > until) break outer;
        if (!push(ms)) break outer;
      }
    }
  } else if (freq === "MONTHLY") {
    // Months vary in length, so step by calendar months rather than by ms.
    const firstMonth =
      count === Infinity && from > event.start
        ? Math.max(0, Math.floor(monthsBetween(event.start, from, tz) / interval) - 1)
        : 0;
    outer: for (let i = firstMonth; i < firstMonth + MAX_OCCURRENCES; i++) {
      const y = w.year + Math.floor((w.month - 1 + i * interval) / 12);
      const mo = ((w.month - 1 + i * interval) % 12) + 1;

      const days: number[] = byMonthDay.length
        ? byMonthDay.map((d) => (d > 0 ? d : daysInMonth(y, mo) + d + 1))
        : byDay.length
          ? byDay.map((code) => nthWeekdayOfMonth(y, mo, code)).filter((d) => d > 0)
          : [w.day];

      for (const d of days.sort((a, b) => a - b)) {
        if (d < 1 || d > daysInMonth(y, mo)) continue;
        const ms = make(y, mo, d);
        if (ms < event.start) continue;
        if (ms > to || ms > until) break outer;
        if (!push(ms)) break outer;
      }
    }
  } else if (freq === "YEARLY") {
    const firstYear =
      count === Infinity && from > event.start
        ? Math.max(0, Math.floor((wallParts(from, tz).year - w.year) / interval) - 1)
        : 0;
    for (let i = firstYear; i < firstYear + MAX_OCCURRENCES; i++) {
      const y = w.year + i * interval;
      const ms = make(y, w.month, w.day);
      if (ms > to || ms > until) break;
      if (ms < event.start) continue;
      if (!push(ms)) break;
    }
  } else {
    // Unknown FREQ: yield the first occurrence rather than nothing, and let
    // `unsupported` explain the gap.
    return event.start >= from && event.start <= to ? [event.start] : [];
  }

  const excluded = new Set(event.exdates);
  return out.filter((ms) => !excluded.has(ms)).sort((a, b) => a - b);
}

function daysInMonth(y: number, mo: number): number {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

function monthsBetween(aMs: number, bMs: number, tz: string): number {
  const a = wallParts(aMs, tz);
  const b = wallParts(bMs, tz);
  return (b.year - a.year) * 12 + (b.month - a.month);
}

function weekdayIn(ms: number, tz: string): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(new Date(ms));
  return DAY_CODES.indexOf(name.slice(0, 2).toUpperCase());
}

function wallParts(
  ms: number,
  tz: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(new Date(ms))
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});

  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** `3TH` → day-of-month of the third Thursday; `-1FR` → the last Friday. */
function nthWeekdayOfMonth(y: number, mo: number, code: string): number {
  const m = /^(-?\d+)?([A-Z]{2})$/.exec(code);
  if (!m) return -1;
  const [, ordRaw, dayCode] = m;
  const target = DAY_CODES.indexOf(dayCode);
  if (target < 0) return -1;

  const total = daysInMonth(y, mo);
  const matches: number[] = [];
  for (let d = 1; d <= total; d++) {
    if (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() === target) matches.push(d);
  }
  if (!ordRaw) return matches[0] ?? -1;

  const ord = Number(ordRaw);
  return ord > 0
    ? (matches[ord - 1] ?? -1)
    : (matches[matches.length + ord] ?? -1);
}

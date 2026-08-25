/*
 * Tests for the ICS parser and recurrence expander.
 *
 * Run with `npm test`. These are not decorative: this file is the reason it is
 * acceptable to expand recurrence ourselves instead of paying Google to do it.
 * A venue that publishes the wrong night loses a customer, so every rule the
 * parser claims to support has a case here, and so does every trap that has
 * actually bitten (all-day date shift, DST, the "no DTEND" case).
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { expandRule, parseICS, type RawEvent } from "./ics.ts";

const TZ = "America/Chicago";

/** Renders an instant as venue-local `YYYY-MM-DD HH:mm`, which is how a human
 *  would check whether the answer is right. */
function local(ms: number): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .formatToParts(new Date(ms))
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day} ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

function ics(...vevents: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
    "VERSION:2.0",
    "X-WR-TIMEZONE:America/Chicago",
    ...vevents,
    "END:VCALENDAR",
  ].join("\r\n");
}

const YEAR = 366 * 86400_000;

function expandAll(e: RawEvent, fromISO: string, toISO: string): string[] {
  return expandRule(e, TZ, Date.parse(fromISO), Date.parse(toISO)).map(local);
}

/* ------------------------------------------------------------------ parse */

describe("parseICS", () => {
  it("reads the real feed shape Google publishes for an all-day event", () => {
    const { events } = parseICS(
      ics(
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20260826",
        "DTEND;VALUE=DATE:20260827",
        "UID:abc@google.com",
        "STATUS:CONFIRMED",
        "SUMMARY:TestEvent",
        "END:VEVENT",
      ),
    );

    assert.equal(events.length, 1);
    assert.equal(events[0].summary, "TestEvent");
    assert.equal(events[0].allDay, true);
    // The trap: parsed naively this lands on the 25th in Central time.
    assert.equal(local(events[0].start).slice(0, 10), "2026-08-26");
  });

  it("keeps a timed event at its wall-clock hour", () => {
    const { events } = parseICS(
      ics(
        "BEGIN:VEVENT",
        "DTSTART;TZID=America/Chicago:20260828T180000",
        "DTEND;TZID=America/Chicago:20260828T210000",
        "UID:t@google.com",
        "SUMMARY:Singo Bingo",
        "END:VEVENT",
      ),
    );
    assert.equal(local(events[0].start), "2026-08-28 18:00");
    assert.equal(events[0].duration, 3 * 3600_000);
  });

  it("converts a UTC DTSTART into venue time", () => {
    const { events } = parseICS(
      ics(
        "BEGIN:VEVENT",
        "DTSTART:20260828T230000Z",
        "UID:z@google.com",
        "SUMMARY:Late",
        "END:VEVENT",
      ),
    );
    // 23:00 UTC in August is 18:00 CDT.
    assert.equal(local(events[0].start), "2026-08-28 18:00");
  });

  it("unfolds long descriptions and unescapes text", () => {
    const { events } = parseICS(
      ics(
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20260826",
        "UID:f@google.com",
        "SUMMARY:Truck Takeover\\, day one",
        "DESCRIPTION:Line one\\nLine two and a very long tail that Google would",
        "  fold across a second physical line",
        "END:VEVENT",
      ),
    );
    assert.equal(events[0].summary, "Truck Takeover, day one");
    assert.match(events[0].description, /^Line one\nLine two/);
    assert.match(events[0].description, /fold across a second physical line$/);
  });

  it("gives an all-day event with no DTEND a full day, not zero", () => {
    const { events } = parseICS(
      ics(
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20260826",
        "UID:n@google.com",
        "SUMMARY:No end",
        "END:VEVENT",
      ),
    );
    assert.equal(events[0].duration, 86400_000);
  });

  it("reports a rule it cannot expand rather than dropping it silently", () => {
    const { events, unsupported } = parseICS(
      ics(
        "BEGIN:VEVENT",
        "DTSTART;TZID=America/Chicago:20260907T190000",
        "UID:u@google.com",
        "SUMMARY:Odd rule",
        "RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=2",
        "END:VEVENT",
      ),
    );
    assert.equal(events.length, 1);
    assert.equal(unsupported.length, 1);
    assert.match(unsupported[0].reason, /BYSETPOS/);

    // ...and still yields something, so the night does not vanish entirely.
    assert.ok(expandAll(events[0], "2026-09-01", "2026-10-01").length >= 1);
  });
});

/* -------------------------------------------------------------- recurrence */

describe("expandRule", () => {
  const parse1 = (...lines: string[]): RawEvent =>
    parseICS(ics("BEGIN:VEVENT", ...lines, "END:VEVENT")).events[0];

  it("expands a weekly bingo night onto the right weekday", () => {
    const e = parse1(
      "DTSTART;TZID=America/Chicago:20260824T180000",
      "UID:w@google.com",
      "SUMMARY:Singo Bingo",
      "RRULE:FREQ=WEEKLY;BYDAY=MO",
    );
    assert.deepEqual(expandAll(e, "2026-08-24", "2026-09-15"), [
      "2026-08-24 18:00",
      "2026-08-31 18:00",
      "2026-09-07 18:00",
      "2026-09-14 18:00",
    ]);
  });

  it("handles a weekly rule with several BYDAYs", () => {
    const e = parse1(
      "DTSTART;TZID=America/Chicago:20260824T170000",
      "UID:w2@google.com",
      "SUMMARY:Happy Hour",
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR",
    );
    assert.deepEqual(expandAll(e, "2026-08-24", "2026-09-01"), [
      "2026-08-24 17:00",
      "2026-08-26 17:00",
      "2026-08-28 17:00",
      "2026-08-31 17:00",
    ]);
  });

  it("respects INTERVAL on a fortnightly rule", () => {
    const e = parse1(
      "DTSTART;TZID=America/Chicago:20260824T180000",
      "UID:w3@google.com",
      "SUMMARY:Every other Monday",
      "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO",
    );
    assert.deepEqual(expandAll(e, "2026-08-24", "2026-09-30"), [
      "2026-08-24 18:00",
      "2026-09-07 18:00",
      "2026-09-21 18:00",
    ]);
  });

  it("stops at COUNT", () => {
    const e = parse1(
      "DTSTART;TZID=America/Chicago:20260824T180000",
      "UID:c@google.com",
      "SUMMARY:Three only",
      "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3",
    );
    assert.equal(expandAll(e, "2026-08-24", "2026-12-01").length, 3);
  });

  it("stops at UNTIL", () => {
    const e = parse1(
      "DTSTART;TZID=America/Chicago:20260824T180000",
      "UID:un@google.com",
      "SUMMARY:Until September",
      "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260908T000000Z",
    );
    assert.deepEqual(expandAll(e, "2026-08-24", "2026-12-01"), [
      "2026-08-24 18:00",
      "2026-08-31 18:00",
      "2026-09-07 18:00",
    ]);
  });

  it("drops EXDATEs — a cancelled week must not appear", () => {
    const e = parse1(
      "DTSTART;TZID=America/Chicago:20260824T180000",
      "UID:x@google.com",
      "SUMMARY:Bingo",
      "RRULE:FREQ=WEEKLY;BYDAY=MO",
      "EXDATE;TZID=America/Chicago:20260831T180000",
    );
    assert.deepEqual(expandAll(e, "2026-08-24", "2026-09-10"), [
      "2026-08-24 18:00",
      "2026-09-07 18:00",
    ]);
  });

  it("expands a monthly 'third Thursday' rule", () => {
    const e = parse1(
      "DTSTART;TZID=America/Chicago:20260917T190000",
      "UID:m@google.com",
      "SUMMARY:Third Thursday market",
      "RRULE:FREQ=MONTHLY;BYDAY=3TH",
    );
    assert.deepEqual(expandAll(e, "2026-09-01", "2026-12-01"), [
      "2026-09-17 19:00",
      "2026-10-15 19:00",
      "2026-11-19 19:00",
    ]);
  });

  it("expands a monthly 'last Friday' rule", () => {
    const e = parse1(
      "DTSTART;TZID=America/Chicago:20260925T200000",
      "UID:m2@google.com",
      "SUMMARY:Last Friday",
      "RRULE:FREQ=MONTHLY;BYDAY=-1FR",
    );
    assert.deepEqual(expandAll(e, "2026-09-01", "2026-12-01"), [
      "2026-09-25 20:00",
      "2026-10-30 20:00",
      "2026-11-27 20:00",
    ]);
  });

  it("expands BYMONTHDAY", () => {
    const e = parse1(
      "DTSTART;TZID=America/Chicago:20260901T120000",
      "UID:m3@google.com",
      "SUMMARY:First of the month",
      "RRULE:FREQ=MONTHLY;BYMONTHDAY=1",
    );
    assert.deepEqual(expandAll(e, "2026-09-01", "2026-11-15"), [
      "2026-09-01 12:00",
      "2026-10-01 12:00",
      "2026-11-01 12:00",
    ]);
  });

  it("expands daily rules", () => {
    const e = parse1(
      "DTSTART;TZID=America/Chicago:20260824T110000",
      "UID:d@google.com",
      "SUMMARY:Lunch service",
      "RRULE:FREQ=DAILY;COUNT=4",
    );
    assert.deepEqual(expandAll(e, "2026-08-24", "2026-09-10"), [
      "2026-08-24 11:00",
      "2026-08-25 11:00",
      "2026-08-26 11:00",
      "2026-08-27 11:00",
    ]);
  });

  it("keeps a weekly 6pm event at 6pm across the DST change", () => {
    // US DST ends 2026-11-01. Stepping in fixed 24h chunks would slide this
    // to 5pm for every occurrence after that date.
    const e = parse1(
      "DTSTART;TZID=America/Chicago:20261026T180000",
      "UID:dst@google.com",
      "SUMMARY:Bingo",
      "RRULE:FREQ=WEEKLY;BYDAY=MO",
    );
    assert.deepEqual(expandAll(e, "2026-10-26", "2026-11-20"), [
      "2026-10-26 18:00",
      "2026-11-02 18:00",
      "2026-11-09 18:00",
      "2026-11-16 18:00",
    ]);
  });

  it("returns nothing outside the requested window", () => {
    const e = parse1(
      "DTSTART;TZID=America/Chicago:20260824T180000",
      "UID:win@google.com",
      "SUMMARY:Bingo",
      "RRULE:FREQ=WEEKLY;BYDAY=MO",
    );
    // January 2027 starts on a Friday, so it holds four Mondays: 4, 11, 18, 25.
    assert.deepEqual(expandAll(e, "2027-01-01", "2027-01-31").length, 4);
    // Nothing before the series begins.
    assert.deepEqual(expandAll(e, "2026-01-01", "2026-02-01"), []);
  });

  it("still finds today's occurrence for a series that began years ago", () => {
    // The failure this guards against is silent: a weekly night created in
    // 2019 exhausts the iteration budget walking through the past, and simply
    // stops appearing on the site with no error anywhere.
    const e = parse1(
      "DTSTART;TZID=America/Chicago:20190107T180000",
      "UID:old@google.com",
      "SUMMARY:Long-running bingo",
      "RRULE:FREQ=WEEKLY;BYDAY=MO",
    );
    assert.deepEqual(expandAll(e, "2026-08-24", "2026-09-08"), [
      "2026-08-24 18:00",
      "2026-08-31 18:00",
      "2026-09-07 18:00",
    ]);
  });

  it("still finds a monthly series that began years ago", () => {
    const e = parse1(
      "DTSTART;TZID=America/Chicago:20190117T190000",
      "UID:oldm@google.com",
      "SUMMARY:Third Thursday, since 2019",
      "RRULE:FREQ=MONTHLY;BYDAY=3TH",
    );
    assert.deepEqual(expandAll(e, "2026-09-01", "2026-11-01"), [
      "2026-09-17 19:00",
      "2026-10-15 19:00",
    ]);
  });

  it("terminates on an unbounded rule instead of running away", () => {
    const e = parse1(
      "DTSTART;TZID=America/Chicago:20260824T180000",
      "UID:inf@google.com",
      "SUMMARY:Forever",
      "RRULE:FREQ=DAILY",
    );
    const started = Date.now();
    const out = expandRule(e, TZ, Date.parse("2026-08-24"), Date.parse("2026-08-24") + YEAR);
    assert.ok(out.length > 0);
    assert.ok(Date.now() - started < 2000, "expansion should be fast");
  });

  it("handles a non-recurring event as a single occurrence", () => {
    const e = parse1(
      "DTSTART;TZID=America/Chicago:20260828T180000",
      "UID:one@google.com",
      "SUMMARY:One night only",
    );
    assert.deepEqual(expandAll(e, "2026-08-01", "2026-09-01"), [
      "2026-08-28 18:00",
    ]);
  });
});

/*
 * Event → HTML.
 *
 * Both the Astro build and the browser render through these functions, so the
 * page that arrives in the HTML and the page after a live refresh are produced
 * by the same code. Anything that formats a date or builds a row belongs here
 * and nowhere else.
 */

import { VENUE_TZ, type PorkyEvent } from "./events";

/* ------------------------------------------------------------------ dates */

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: VENUE_TZ, ...opts });

const F = {
  weekday: fmt({ weekday: "short" }),
  day: fmt({ day: "numeric" }),
  month: fmt({ month: "short" }),
  time: fmt({ hour: "numeric", minute: "2-digit" }),
  full: fmt({ weekday: "long", month: "long", day: "numeric" }),
  monthYear: fmt({ month: "long", year: "numeric" }),
};

/**
 * All-day events arrive as a bare `YYYY-MM-DD`. Parsing that with `new Date()`
 * lands on UTC midnight, which in Humble is the evening *before* — an all-day
 * Saturday event renders as Friday. Pin it to noon so no timezone shift can
 * move it off its own day.
 */
export function toDate(iso: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T12:00:00`)
    : new Date(iso);
}

/** `2026-08-24` in venue time — the key both views group by. */
export function dayKey(d: Date): string {
  const p = fmt({ year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(d)
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * "Tonight", "Tomorrow", or a date. People checking a food truck park at 5pm
 * on a Friday are asking about tonight, so name it that way when it is.
 */
export function relativeLabel(start: Date, now: Date): string {
  const days =
    (Date.parse(dayKey(start)) - Date.parse(dayKey(now))) / 86400_000;
  if (days === 0) return start.getHours() >= 16 ? "Tonight" : "Today";
  if (days === 1) return "Tomorrow";
  return F.full.format(start);
}

export function timeLabel(e: PorkyEvent): string {
  return e.allDay ? "All day" : F.time.format(toDate(e.start));
}

/* ------------------------------------------------------------------ escape */

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Calendar text is authored in Google and is not trusted markup. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Only http(s) links become buttons — no `javascript:` from a description. */
function safeHref(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------- next-up */

export function nextUp(events: PorkyEvent[], now: Date): PorkyEvent | null {
  const cutoff = now.getTime();
  return (
    events.find((e) => toDate(e.end ?? e.start).getTime() >= cutoff) ?? null
  );
}

export function nextUpHTML(e: PorkyEvent | null, now: Date): string {
  if (!e) {
    return `<p class="nextup-empty">No events on the books right now. New trucks and live music get added every week — check back soon.</p>`;
  }
  const start = toDate(e.start);
  const when = e.allDay
    ? relativeLabel(start, now)
    : `${relativeLabel(start, now)} · ${F.time.format(start)}`;
  const href = safeHref(e.link);

  return `
    <p class="nextup-eyebrow">Next up</p>
    <p class="nextup-when">${esc(when)}</p>
    <h2 class="nextup-title">${esc(e.title)}</h2>
    ${e.description ? `<p class="nextup-desc">${esc(e.description)}</p>` : ""}
    ${href ? `<a class="btn btn-red" href="${esc(href)}">Get details</a>` : ""}
  `;
}

/* ------------------------------------------------------------ list view */

function rowHTML(e: PorkyEvent, now: Date): string {
  const start = toDate(e.start);
  const href = safeHref(e.link);
  const today = dayKey(start) === dayKey(now);

  return `
    <li class="row${today ? " row-today" : ""}">
      <div class="rail" aria-hidden="true">
        <span class="rail-wd">${F.weekday.format(start)}</span>
        <span class="rail-day">${F.day.format(start)}</span>
        <span class="rail-mo">${F.month.format(start)}</span>
      </div>
      <div class="row-body">
        <p class="row-time">
          <span class="vh">Starts at </span>${esc(timeLabel(e))}${
            today ? `<span class="chip-today">Today</span>` : ""
          }
        </p>
        <h3 class="row-title">${esc(e.title)}</h3>
        ${e.description ? `<p class="row-desc">${esc(e.description)}</p>` : ""}
        ${e.location ? `<p class="row-loc">${esc(e.location)}</p>` : ""}
      </div>
      ${
        href
          ? `<a class="btn btn-ghost row-cta" href="${esc(href)}">Details<span class="vh"> for ${esc(e.title)}</span></a>`
          : ""
      }
    </li>`;
}

export function listHTML(events: PorkyEvent[], now: Date): string {
  if (!events.length) {
    return `<p class="empty">The calendar is clear for now. We book new trucks, music and bingo nights every week — check back, or call (281) 761-6844 for tonight's lineup.</p>`;
  }
  return `<ul class="rows">${events.map((e) => rowHTML(e, now)).join("")}</ul>`;
}

/* ------------------------------------------------------------ month grid */

/** Sunday-first weeks, because that is how a US wall calendar reads. */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** `2026-08` — the month the grid is currently showing. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthFromKey(key: string): Date {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

/**
 * How far the arrows may travel. There is no point offering a month the feed
 * does not cover — WINDOW_DAYS is 120, so the fourth month ahead would always
 * render empty and read as "nothing booked" rather than "not loaded".
 */
export function monthBounds(now: Date): { min: string; max: string } {
  const max = new Date(now.getFullYear(), now.getMonth(), 1);
  max.setMonth(max.getMonth() + 3);
  return { min: monthKey(now), max: monthKey(max) };
}

export function monthHTML(
  events: PorkyEvent[],
  monthOf: Date,
  now: Date,
): string {
  const y = monthOf.getFullYear();
  const m = monthOf.getMonth();
  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const lead = first.getDay();
  const todayKey = dayKey(now);

  const byDay = new Map<string, PorkyEvent[]>();
  for (const e of events) {
    const k = dayKey(toDate(e.start));
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(e);
  }

  const cells: string[] = [];
  for (let i = 0; i < lead; i++) {
    cells.push(`<td class="cell cell-blank"></td>`);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayEvents = byDay.get(key) ?? [];
    const isToday = key === todayKey;

    const chips = dayEvents
      .map(
        (e) =>
          `<span class="chip" title="${esc(e.title)} · ${esc(timeLabel(e))}">${esc(e.title)}</span>`,
      )
      .join("");

    cells.push(`
      <td class="cell${isToday ? " cell-today" : ""}${dayEvents.length ? " cell-has" : ""}">
        <span class="cell-num">
          <span class="cell-wd">${WEEKDAYS[new Date(y, m, d).getDay()]}</span>
          <span class="cell-d">${d}</span>${isToday ? `<span class="vh"> (today)</span>` : ""}
        </span>
        ${chips ? `<div class="chips">${chips}</div>` : ""}
      </td>`);
  }
  while (cells.length % 7 !== 0) cells.push(`<td class="cell cell-blank"></td>`);

  const weeks: string[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(`<tr>${cells.slice(i, i + 7).join("")}</tr>`);
  }

  const key = monthKey(first);
  const { min, max } = monthBounds(now);
  const label = F.monthYear.format(first);

  return `
    <div class="month-nav">
      <button class="month-arrow" data-month-step="-1" ${key <= min ? "disabled" : ""}>
        <span aria-hidden="true">&lsaquo;</span><span class="vh">Previous month</span>
      </button>
      <p class="month-name">${label}</p>
      <button class="month-arrow" data-month-step="1" ${key >= max ? "disabled" : ""}>
        <span aria-hidden="true">&rsaquo;</span><span class="vh">Next month</span>
      </button>
    </div>
    <table class="month" data-month="${key}">
      <caption class="vh">Events at Porky's Backyard, ${label}</caption>
      <thead>
        <tr>${WEEKDAYS.map((w, i) => `<th scope="col"><span aria-hidden="true">${w}</span><span class="vh">${WEEKDAYS_FULL[i]}</span></th>`).join("")}</tr>
      </thead>
      <tbody>${weeks.join("")}</tbody>
    </table>`;
}

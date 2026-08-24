/*
 * Placeholder events, used ONLY when no Google Calendar is configured.
 *
 * This exists so the page can be designed and reviewed before the calendar id
 * lands. The titles are drawn from what the park actually runs, but every one
 * of them is invented — none of these are real bookings.
 *
 * The moment GOOGLE_CALENDAR_ID is set, this file stops being reachable. It is
 * kept for local development, not deleted, because a designer needs a populated
 * page to work against. See `isSample` on the render path: the page prints a
 * visible notice whenever this data is what is on screen, so placeholder
 * events can never be mistaken for a published schedule.
 */

import type { PorkyEvent } from "../lib/events";

/** Dates are generated relative to now so the fixture never goes stale. */
export function sampleEvents(now: Date = new Date()): PorkyEvent[] {
  const at = (dayOffset: number, hour: number, minute = 0): string => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };

  const seed: Array<[number, number, string, string]> = [
    [0, 18, "Singo Bingo", "Free to enter, gift card prizes all night."],
    [1, 19, "Live Music: The Humble Ramblers", "Texas country on the main stage."],
    [2, 12, "Truck Takeover: Birria Bros", "Four hours only, until they sell out."],
    [5, 20, "Sim Racing League Night", "Open seat racing on the full-motion rigs."],
    [7, 18, "Singo Bingo", "Free to enter, gift card prizes all night."],
    [9, 17, "Tap Takeover: Saint Arnold", "Twelve handles, one brewery, all evening."],
    [12, 11, "Backyard Market", "Local makers, coffee trucks, dogs welcome."],
    [14, 18, "Singo Bingo", "Free to enter, gift card prizes all night."],
  ];

  return seed.map(([day, hour, title, description], i) => ({
    id: `sample-${i}`,
    title,
    description,
    start: at(day, hour),
    end: at(day, hour + 3),
    allDay: false,
    location: "",
    link: null,
  }));
}

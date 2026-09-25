/*
 * Two jobs: switch between the two views, and keep the schedule current
 * without a reload.
 *
 * The page already arrived with a real, server-rendered schedule. Everything
 * here is an upgrade on top of that — if any of it fails, the visitor still
 * has the schedule that was baked in at build time. Nothing below may remove
 * content it cannot replace.
 */

import type { PorkyEvent } from "../lib/events";
import {
  eventDetailHTML,
  listHTML,
  monthBounds,
  monthFromKey,
  monthHTML,
  monthKey,
  nextUp,
  nextUpHTML,
} from "../lib/render";

/**
 * The only mutable state on the page: what we last heard from the calendar,
 * and which month the grid is parked on. Both views re-derive from this, so
 * paging the grid and refreshing the feed cannot fall out of step.
 */
const state: { events: PorkyEvent[]; month: string } = {
  events: [],
  month: monthKey(new Date()),
};

/** Remembered per tab, not persisted — a view preference is not worth a cookie. */
const VIEW_KEY = "pbe.view";

/** Matches the edge cache on /api/events. Refreshing faster only burns quota. */
const REFRESH_MS = 5 * 60 * 1000;

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/* ------------------------------------------------------------- view toggle */

function initTabs(): void {
  const tabs = [
    { btn: el<HTMLButtonElement>("tab-list"), panel: el("panel-list"), name: "list" },
    { btn: el<HTMLButtonElement>("tab-month"), panel: el("panel-month"), name: "month" },
  ].filter((t) => t.btn && t.panel);

  if (tabs.length !== 2) return;

  const show = (name: string): void => {
    for (const t of tabs) {
      const on = t.name === name;
      t.btn!.classList.toggle("is-on", on);
      t.btn!.setAttribute("aria-selected", String(on));
      t.btn!.tabIndex = on ? 0 : -1;
      t.panel!.classList.toggle("is-hidden", !on);
      t.panel!.toggleAttribute("hidden", !on);
    }
    try {
      sessionStorage.setItem(VIEW_KEY, name);
    } catch {
      /* private mode — the toggle still works, it just will not persist. */
    }
  };

  for (const t of tabs) {
    t.btn!.addEventListener("click", () => show(t.name));
    // Left/right between tabs is what a screen reader user expects here.
    t.btn!.addEventListener("keydown", (ev: KeyboardEvent) => {
      if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
      ev.preventDefault();
      const other = tabs.find((x) => x !== t)!;
      show(other.name);
      other.btn!.focus();
    });
  }

  let saved: string | null = null;
  try {
    saved = sessionStorage.getItem(VIEW_KEY);
  } catch {
    /* ignore */
  }
  if (saved === "month") show("month");
}

/* ---------------------------------------------------------------- refresh */

/*
 * Every string written below is built by src/lib/render.ts, which escapes all
 * calendar-authored text through `esc()` and rejects any href that is not
 * http(s). Nothing from the feed reaches innerHTML unescaped — keep it that
 * way if you add a field.
 */
function paint(): void {
  const now = new Date();

  const list = el("panel-list");
  const month = el("panel-month");
  const hero = el("nextup");

  if (list) list.innerHTML = listHTML(state.events, now);
  if (month) {
    month.innerHTML = monthHTML(state.events, monthFromKey(state.month), now);
  }
  if (hero) hero.innerHTML = nextUpHTML(nextUp(state.events, now), now);
}

/**
 * Delegated, because the grid replaces its own markup on every paint and
 * re-binding arrows each time is how you end up with duplicate listeners.
 */
function initMonthNav(): void {
  const panel = el("panel-month");
  if (!panel) return;

  panel.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-month-step]",
    );
    if (!btn || btn.disabled) return;

    const step = Number(btn.dataset.monthStep);
    const next = monthFromKey(state.month);
    next.setMonth(next.getMonth() + step);

    const key = monthKey(next);
    const { min, max } = monthBounds(new Date());
    if (key < min || key > max) return;

    state.month = key;
    paint();

    // The arrow the visitor just pressed was destroyed by the repaint; put
    // focus back on its replacement so keyboard paging keeps working.
    panel
      .querySelector<HTMLButtonElement>(
        `[data-month-step="${step}"]:not([disabled])`,
      )
      ?.focus();
  });
}

/**
 * A chip in the grid only has room for a clipped title, so clicking one opens
 * the whole event in a dialog. Delegated for the same reason as the arrows.
 */
function initEventDetail(): void {
  const panel = el("panel-month");
  const dialog = el<HTMLDialogElement>("event-detail");
  const body = el("event-detail-body");
  if (!panel || !dialog || !body || typeof dialog.showModal !== "function") {
    return;
  }

  panel.addEventListener("click", (ev) => {
    const chip = (ev.target as HTMLElement).closest<HTMLElement>(
      "[data-event-id]",
    );
    if (!chip) return;
    const e = state.events.find((x) => x.id === chip.dataset.eventId);
    if (!e) return;

    body.innerHTML = eventDetailHTML(e, new Date());
    dialog.showModal();
  });

  // A click on the backdrop lands on the <dialog> itself, not its contents.
  dialog.addEventListener("click", (ev) => {
    if (ev.target === dialog) dialog.close();
  });
}

function note(message: string): void {
  const f = el("freshness");
  if (f) f.textContent = message;
}

async function refresh(): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/events", { headers: { accept: "application/json" } });
  } catch {
    // Offline or blocked. The baked-in schedule is still on screen and still
    // correct enough — say nothing rather than raising an alarm about it.
    return;
  }

  if (!res.ok) {
    // 503 means the calendar is not wired up yet and 404 means the function
    // is not deployed at all (which is also every local `astro preview` run).
    // The page already explains both in its own notice, so warning here would
    // be crying wolf. Anything else is a real fault worth naming, because a
    // silently stale schedule at a venue is worse than an admitted one.
    if (res.status !== 503 && res.status !== 404) {
      note("Showing the last known schedule — we couldn't reach the calendar just now.");
    }
    return;
  }

  const body = (await res.json()) as { events?: PorkyEvent[] };
  if (!Array.isArray(body.events)) return;

  state.events = body.events;
  paint();
  note(
    `Updated ${new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Chicago",
    }).format(new Date())}`,
  );
}

/**
 * Seed from the schedule the server already baked into the page. Without this
 * the month arrows would page into empty grids until the first fetch lands —
 * and would stay empty forever anywhere /api/events is not deployed.
 */
function seed(): void {
  const tag = document.getElementById("seed-events");
  if (!tag?.textContent) return;
  try {
    const parsed = JSON.parse(tag.textContent) as PorkyEvent[];
    if (Array.isArray(parsed)) state.events = parsed;
  } catch {
    /* Malformed seed is not worth breaking the page over; the fetch follows. */
  }
}

export function initLive(): void {
  seed();
  initTabs();
  initMonthNav();
  initEventDetail();

  void refresh();
  setInterval(() => void refresh(), REFRESH_MS);

  // A phone left open on the counter all evening should be right when someone
  // picks it up, not five minutes stale.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refresh();
  });
}

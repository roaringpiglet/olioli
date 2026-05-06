import { addMonths, parseISO, toISO } from "./dates";
import type { MonthlyGoal, TimelineItem, TimelineTrack } from "@/types/db";

// A Throughline is a named, ongoing thread of work within a single track.
// Example: inside "Extracurriculars" a student might run two threads in
// parallel — "Parsons Summer School" and "Upcycling Fashion Club" — with
// timeline items and monthly goals split between them. We derive threads
// on the fly from whatever items + goals carry the same (track, thread).
export interface Thread {
  key: string; // `${track}::${normalized}` — stable dom id
  name: string; // display name (trimmed, original casing)
  track: TimelineTrack;
  startISO: string;
  endISO: string; // exclusive
  items: TimelineItem[];
  goals: MonthlyGoal[];
}

export function normalizeThread(s: string | null | undefined): string {
  return (s ?? "").trim();
}

function threadKey(track: TimelineTrack, name: string): string {
  return `${track}::${name.toLowerCase()}`;
}

// Pull distinct thread names already used in this track so the editor can
// suggest them via a <datalist>.
export function threadSuggestions(
  items: TimelineItem[],
  goals: MonthlyGoal[],
  track: TimelineTrack
): string[] {
  const seen = new Map<string, string>(); // lowercase → original
  for (const it of items) {
    if (it.track !== track) continue;
    const n = normalizeThread(it.thread);
    if (n && !seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n);
  }
  for (const g of goals) {
    if (g.track !== track) continue;
    const n = normalizeThread(g.thread);
    if (n && !seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

// Group every item + goal in `track` into threads. Items/goals without a
// thread are skipped — they stay on the main bar row, not on a faint
// strip. The resulting thread span is [min start, max end] across
// everything in the thread, with each monthly goal contributing its full
// calendar month.
export function computeThreads(
  items: TimelineItem[],
  goals: MonthlyGoal[],
  track: TimelineTrack
): Thread[] {
  const map = new Map<string, Thread>();

  const upsert = (name: string, startISO: string, endISO: string): Thread => {
    const key = threadKey(track, name);
    const existing = map.get(key);
    if (existing) {
      if (startISO < existing.startISO) existing.startISO = startISO;
      if (endISO > existing.endISO) existing.endISO = endISO;
      return existing;
    }
    const next: Thread = {
      key,
      name,
      track,
      startISO,
      endISO,
      items: [],
      goals: [],
    };
    map.set(key, next);
    return next;
  };

  for (const it of items) {
    if (it.track !== track) continue;
    const n = normalizeThread(it.thread);
    if (!n) continue;
    const t = upsert(n, it.start_date, it.end_date);
    t.items.push(it);
  }

  for (const g of goals) {
    if (g.track !== track) continue;
    const n = normalizeThread(g.thread);
    if (!n) continue;
    const ms = g.month; // YYYY-MM-01
    const me = toISO(addMonths(parseISO(ms), 1)); // exclusive next month
    const t = upsert(n, ms, me);
    t.goals.push(g);
  }

  // Sort by start date so earlier threads float to the top row in the lane.
  return Array.from(map.values()).sort((a, b) =>
    a.startISO < b.startISO ? -1 : a.startISO > b.startISO ? 1 : 0
  );
}

// Compact fingerprint of a thread's visible content, used by the hover
// card to key its AI-summary cache. Changes whenever an item or goal in
// the thread is added, removed, or edited.
export function threadContentHash(thread: Thread): string {
  const parts: string[] = [];
  for (const it of thread.items) {
    parts.push(`i:${it.id}:${it.updated_at}:${it.status}`);
  }
  for (const g of thread.goals) {
    parts.push(`g:${g.id}:${g.updated_at}`);
  }
  parts.sort();
  return parts.join("|");
}

// All date math here is "local calendar" — we treat ISO date strings as
// bare calendar dates, not instants. That keeps week/month boundaries
// stable across timezones for a single-family app.
//
// Formatting is locked to zh-CN for display, because the app is
// Chinese-only today. (If a future English toggle lands, swap LOCALE for
// a per-request value.) AI-facing formatters deliberately use this same
// zh-CN output so prompts carry Chinese dates to Claude.

import { LOCALE } from "@/i18n/config";

export const DAY_MS = 24 * 60 * 60 * 1000;

export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Monday-anchored week start.
export function weekStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7);
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

export function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function fmtDate(iso: string | Date): string {
  const d = typeof iso === "string" ? parseISO(iso) : iso;
  return d.toLocaleDateString(LOCALE, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function fmtShort(iso: string | Date): string {
  const d = typeof iso === "string" ? parseISO(iso) : iso;
  return d.toLocaleDateString(LOCALE, { month: "long", day: "numeric" });
}

export function fmtMonth(iso: string | Date): string {
  const d = typeof iso === "string" ? parseISO(iso) : iso;
  return d.toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
}

// Human-friendly week label in Chinese. Shapes:
//   2026年4月20日 – 26日          (same month)
//   2026年4月27日 – 5月3日        (same year, crossing a month)
//   2025年12月29日 – 2026年1月4日 (crossing a year)
export function fmtWeekRange(mondayISO: string): string {
  const start = parseISO(mondayISO);
  const end = addDays(start, 6);
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();

  if (sameMonth) {
    const head = start.toLocaleDateString(LOCALE, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return `${head} – ${end.getDate()}日`;
  }
  if (sameYear) {
    const head = start.toLocaleDateString(LOCALE, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const tail = end.toLocaleDateString(LOCALE, {
      month: "long",
      day: "numeric",
    });
    return `${head} – ${tail}`;
  }
  const head = start.toLocaleDateString(LOCALE, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const tail = end.toLocaleDateString(LOCALE, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `${head} – ${tail}`;
}

// Inclusive "today falls inside [start, end]?" using ISO date strings.
export function dateInRange(
  isoDate: string,
  startISO: string,
  endISO: string
): boolean {
  return isoDate >= startISO && isoDate <= endISO;
}

// Whole calendar days between two dates (b - a), ignoring DST.
export function daysBetween(a: Date, b: Date): number {
  const ax = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bx = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((bx - ax) / DAY_MS);
}

// Iterate month starts that overlap [start, end]. Inclusive on both ends.
export function monthsBetween(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  let cur = monthStart(start);
  const last = monthStart(end);
  while (cur <= last) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}

export function fmtMonthShort(d: Date): string {
  return d.toLocaleDateString(LOCALE, { year: "numeric", month: "short" });
}

// Human-friendly meeting time in Chinese. Example: "4月22日 周三 · 15:30"
export function fmtMeetingTime(iso: string | null | undefined): string {
  if (!iso) return "时间未定";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "时间未定";
  const date = d.toLocaleDateString(LOCALE, {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  const time = d.toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} · ${time}`;
}

export function fmtMeetingDateTime(iso: string | null | undefined): string {
  if (!iso) return "时间未定";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "时间未定";
  const date = d.toLocaleDateString(LOCALE, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const time = d.toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} · ${time}`;
}

// Convert an ISO timestamp into the `YYYY-MM-DDTHH:mm` form that an
// <input type="datetime-local"> expects (in local time).
export function toLocalDatetimeInputValue(
  iso: string | null | undefined
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes())
  );
}

// Shared relative-time helper. Returns Chinese phrases like "刚刚",
// "12 分钟前", "3 小时前", "2 天前", or the localized date for anything
// older than ~30 days.
export function fmtTimeAgo(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const delta = Date.now() - then;
    const min = Math.round(delta / 60000);
    if (min < 1) return "刚刚";
    if (min < 60) return `${min} 分钟前`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr} 小时前`;
    const d = Math.round(hr / 24);
    if (d < 30) return `${d} 天前`;
    return new Date(iso).toLocaleDateString(LOCALE);
  } catch {
    return iso;
  }
}

// "今天" / "明天" / "昨天" / "N 天后" / "N 天前" for a YYYY-MM-DD date
// relative to today, plus null when the input can't be parsed.
export function fmtDaysAway(iso: string): string | null {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    const target = new Date(y, (m || 1) - 1, d || 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const n = Math.round((target.getTime() - today.getTime()) / DAY_MS);
    if (n === 0) return "今天";
    if (n === 1) return "明天";
    if (n === -1) return "昨天";
    if (n < 0) return `${Math.abs(n)} 天前`;
    return `${n} 天后`;
  } catch {
    return null;
  }
}

export function daysFromToday(iso: string): number | null {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    const target = new Date(y, (m || 1) - 1, d || 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / DAY_MS);
  } catch {
    return null;
  }
}

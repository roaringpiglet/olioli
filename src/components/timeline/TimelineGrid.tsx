"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addMonths,
  daysBetween,
  fmtMonthShort,
  parseISO,
  toISO,
} from "@/lib/dates";
import { STATUS_CHIP, STATUS_LABEL, TRACKS, trackById } from "@/lib/tracks";
import { computeThreads, type Thread } from "@/lib/threads";
import type { MonthlyGoal, TimelineItem, TimelineTrack } from "@/types/db";
import { ThreadHoverCard } from "./ThreadHoverCard";

interface Props {
  items: TimelineItem[];
  goals: MonthlyGoal[];
  fromISO: string;
  months: number;
  todayISO: string;
  // Date the canvas should scroll to on mount (left edge). Defaults to today.
  anchorISO?: string;
  canEdit: boolean;
  onOpenItem: (item: TimelineItem) => void;
  onAddInTrack: (track: TimelineTrack) => void;
}

const ROW_HEIGHT = 30;
const ROW_GAP = 6;
const LANE_PADDING_Y = 12;
const LANE_LABEL_W = 200;
// Floor so even an empty lane is tall enough to render the label on one line
// without overlapping the next lane.
const LANE_MIN_HEIGHT = 56;

// Throughline strip (faint line) sizing. Each thread gets its own horizontal
// strip stacked in a dedicated zone at the bottom of the lane.
const STRIP_H = 14;
const STRIP_GAP = 4;
const STRIP_ZONE_TOP_PAD = 6;
const STRIP_ZONE_BOTTOM_PAD = 6;

function monthPxFor(months: number): number {
  if (months <= 6) return 200;
  if (months <= 12) return 140;
  if (months <= 24) return 100;
  return 80;
}

// Pack items into the fewest rows where no two on the same row overlap.
// Returns { rows: number, rowOf: Map<id, number> }.
function packLane(items: TimelineItem[]): {
  rows: number;
  rowOf: Map<string, number>;
} {
  const sorted = [...items].sort((a, b) =>
    a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0
  );
  const rowEnds: string[] = []; // last end_date per row
  const rowOf = new Map<string, number>();
  for (const it of sorted) {
    let placed = false;
    for (let r = 0; r < rowEnds.length; r++) {
      if (it.start_date > rowEnds[r]) {
        rowEnds[r] = it.end_date;
        rowOf.set(it.id, r);
        placed = true;
        break;
      }
    }
    if (!placed) {
      rowOf.set(it.id, rowEnds.length);
      rowEnds.push(it.end_date);
    }
  }
  return { rows: Math.max(rowEnds.length, 1), rowOf };
}

export function TimelineGrid({
  items,
  goals,
  fromISO,
  months,
  todayISO,
  anchorISO,
  canEdit,
  onOpenItem,
  onAddInTrack,
}: Props) {
  const fromDate = parseISO(fromISO);
  const endDate = addMonths(fromDate, months);
  const totalDays = daysBetween(fromDate, endDate);
  const monthPx = monthPxFor(months);
  const contentWidth = months * monthPx;
  const dayPx = contentWidth / totalDays;

  // Anchor the scroll position to today (or the supplied anchor) on mount,
  // and re-anchor whenever the loaded window or zoom changes.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const anchor = anchorISO ?? todayISO;
  const anchorDate = parseISO(anchor);
  const anchorInWindow = anchorDate >= fromDate && anchorDate < endDate;
  const anchorLeft = anchorInWindow
    ? daysBetween(fromDate, anchorDate) * dayPx
    : 0;
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // Small left padding so a few days of past stay visible as a hint that
    // there's more behind today.
    el.scrollLeft = Math.max(0, anchorLeft - 12);
  }, [anchorLeft, contentWidth]);

  // --- Hover state for throughline strips ---------------------------------
  // Deliberately delayed open/close so the card feels like a tooltip, not a
  // twitchy popup, and the user has time to move into the card to click.
  const [hover, setHover] = useState<{
    threadKey: string;
    rect: DOMRect;
  } | null>(null);
  const timerRef = useRef<number | null>(null);
  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  const scheduleOpen = useCallback(
    (threadKey: string, rect: DOMRect) => {
      clearTimer();
      timerRef.current = window.setTimeout(
        () => setHover({ threadKey, rect }),
        180
      );
    },
    [clearTimer]
  );
  const scheduleClose = useCallback(() => {
    clearTimer();
    timerRef.current = window.setTimeout(() => setHover(null), 160);
  }, [clearTimer]);
  const cancelClose = useCallback(() => {
    clearTimer();
  }, [clearTimer]);
  useEffect(() => () => clearTimer(), [clearTimer]);
  // Close the hover card if the user scrolls the timeline canvas — the strip
  // would slide out from under the fixed-positioned card otherwise.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => setHover(null);
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const monthMarkers = Array.from({ length: months }, (_, i) => {
    const d = addMonths(fromDate, i);
    return { iso: toISO(d), label: fmtMonthShort(d), left: i * monthPx };
  });

  const todayDate = parseISO(todayISO);
  const todayInWindow = todayDate >= fromDate && todayDate < endDate;
  const todayLeft = todayInWindow
    ? daysBetween(fromDate, todayDate) * dayPx
    : -1;

  // Group items and goals by track so each lane knows what to render.
  const byTrack: Record<TimelineTrack, TimelineItem[]> = {
    academic: [],
    testing: [],
    extracurriculars: [],
    portfolio: [],
    college_application: [],
    personal_development: [],
  };
  for (const it of items) byTrack[it.track].push(it);

  // Group items + goals into threads per track. Each thread becomes one
  // faint strip in the track's "strip zone" at the bottom of the lane.
  const threadsByTrack = useMemo(() => {
    const map = new Map<TimelineTrack, Thread[]>();
    for (const t of TRACKS) {
      map.set(t.id, computeThreads(items, goals, t.id));
    }
    return map;
  }, [items, goals]);

  const allThreadsByKey = useMemo(() => {
    const map = new Map<string, Thread>();
    for (const arr of threadsByTrack.values()) {
      for (const th of arr) map.set(th.key, th);
    }
    return map;
  }, [threadsByTrack]);

  const hoveredThread = hover ? allThreadsByKey.get(hover.threadKey) ?? null : null;

  const layouts = TRACKS.map((t) => {
    const packed = packLane(byTrack[t.id]);
    const threads = threadsByTrack.get(t.id) ?? [];
    // The strip zone holds one row per thread, stacked bottom-up.
    const stripZoneH =
      threads.length > 0
        ? STRIP_ZONE_TOP_PAD +
          threads.length * STRIP_H +
          (threads.length - 1) * STRIP_GAP +
          STRIP_ZONE_BOTTOM_PAD
        : 0;
    const contentH =
      LANE_PADDING_Y * 2 +
      packed.rows * ROW_HEIGHT +
      (packed.rows - 1) * ROW_GAP;
    const laneHeight =
      Math.max(contentH, LANE_MIN_HEIGHT) + stripZoneH;
    return {
      track: t,
      items: byTrack[t.id],
      threads,
      packed,
      laneHeight,
      stripZoneH,
    };
  });

  const headerHeight = 28;

  return (
    <>
    <div className="card overflow-hidden">
      <div className="flex">
        {/* Sticky lane labels */}
        <div
          className="shrink-0 border-r border-ink-200 bg-ink-50/40"
          style={{ width: LANE_LABEL_W }}
        >
          <div
            className="border-b border-ink-200"
            style={{ height: headerHeight }}
          />
          {layouts.map(({ track, laneHeight }) => (
            <div
              key={track.id}
              className="border-b border-ink-100 px-3 flex items-center gap-2"
              style={{ height: laneHeight }}
              title={track.blurb}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full shrink-0 ${track.dot}`}
              />
              <span className="text-sm font-medium text-ink-900 truncate flex-1 min-w-0">
                {track.label}
              </span>
              {canEdit ? (
                <button
                  type="button"
                  className="shrink-0 text-[11px] text-brand-700 hover:text-brand-800 px-1.5 py-0.5 rounded hover:bg-brand-50"
                  onClick={() => onAddInTrack(track.id)}
                  title={`在「${track.label}」里添加条目`}
                  aria-label={`在「${track.label}」里添加条目`}
                >
                  + 添加
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {/* Scrollable timeline canvas */}
        <div ref={scrollerRef} className="overflow-x-auto flex-1">
          <div style={{ width: contentWidth, position: "relative" }}>
            {/* Header: month labels + faint vertical grid */}
            <div
              className="relative border-b border-ink-200 bg-white"
              style={{ height: headerHeight, width: contentWidth }}
            >
              {monthMarkers.map((m) => (
                <div
                  key={m.iso}
                  className="absolute top-0 bottom-0 border-l border-ink-100 pl-2 text-[11px] uppercase tracking-wider text-ink-500 font-semibold flex items-center"
                  style={{ left: m.left, width: monthPx }}
                >
                  {m.label}
                </div>
              ))}
            </div>

            {/* Lanes */}
            {layouts.map(
              ({ track, items: trackItems, threads, packed, laneHeight, stripZoneH }) => (
              <div
                key={track.id}
                className="relative border-b border-ink-100"
                style={{ height: laneHeight, width: contentWidth }}
              >
                {/* Vertical month grid */}
                {monthMarkers.map((m) => (
                  <div
                    key={m.iso}
                    className="absolute top-0 bottom-0 border-l border-ink-100"
                    style={{ left: m.left }}
                  />
                ))}
                {/* Throughline strips — one faint line per named thread in
                    this track. Each strip's extent covers the union of its
                    items and monthly goals; only threads with *something*
                    happening show up. Stacked bottom-up so the newest
                    thread reads on top. */}
                {threads.map((th, idx) => {
                  const startD = parseISO(th.startISO);
                  const endD = parseISO(th.endISO);
                  if (endD <= fromDate || startD >= endDate) return null;
                  const clampedStart = startD < fromDate ? fromDate : startD;
                  const clampedEnd = endD > endDate ? endDate : endD;
                  const left = daysBetween(fromDate, clampedStart) * dayPx;
                  const width = Math.max(
                    daysBetween(clampedStart, clampedEnd) * dayPx - 2,
                    24
                  );
                  const bottom =
                    STRIP_ZONE_BOTTOM_PAD + idx * (STRIP_H + STRIP_GAP);
                  const isHovered = hover?.threadKey === th.key;
                  return (
                    <button
                      key={th.key}
                      type="button"
                      aria-label={`${track.label}方向的主线：${th.name}`}
                      onMouseEnter={(e) =>
                        scheduleOpen(
                          th.key,
                          (e.currentTarget as HTMLElement).getBoundingClientRect()
                        )
                      }
                      onMouseLeave={scheduleClose}
                      onFocus={(e) =>
                        scheduleOpen(
                          th.key,
                          (e.currentTarget as HTMLElement).getBoundingClientRect()
                        )
                      }
                      onBlur={scheduleClose}
                      className={
                        `absolute rounded-md cursor-help transition-opacity overflow-hidden text-left ${track.bar} ` +
                        (isHovered ? "opacity-80" : "opacity-30 hover:opacity-60")
                      }
                      style={{ left, width, height: STRIP_H, bottom }}
                      title={`${th.name} · ${th.items.length} 条条目，${th.goals.length} 条目标`}
                    >
                      <span
                        className="block truncate text-white/95 text-[10.5px] font-medium leading-[14px] px-1.5"
                        style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
                      >
                        {th.name}
                      </span>
                    </button>
                  );
                })}
                {/* Items */}
                {trackItems.map((it) => {
                  const isDeadline = it.start_date === it.end_date;
                  const startD = parseISO(it.start_date);
                  const endD = parseISO(it.end_date);
                  const clampedStart = startD < fromDate ? fromDate : startD;
                  const clampedEnd =
                    endD >= endDate ? addMonths(fromDate, months) : endD;
                  const left = daysBetween(fromDate, clampedStart) * dayPx;
                  const widthRaw =
                    (daysBetween(clampedStart, clampedEnd) + 1) * dayPx;
                  // Deadlines render as narrow pins anchored exactly on
                  // their date; ranges render as bars with a minimum width
                  // so short ranges stay clickable.
                  const width = isDeadline
                    ? Math.max(widthRaw, 14)
                    : Math.max(widthRaw, 20);
                  const row = packed.rowOf.get(it.id) ?? 0;
                  const top = LANE_PADDING_Y + row * (ROW_HEIGHT + ROW_GAP);
                  const title = `${isDeadline ? "截止" : "时间段"}：${it.title} · ${
                    isDeadline
                      ? it.start_date
                      : `${it.start_date} → ${it.end_date}`
                  }`;
                  if (isDeadline) {
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => onOpenItem(it)}
                        className={
                          "absolute flex items-center text-left text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-400 " +
                          (it.status === "done" ? "opacity-60" : "")
                        }
                        style={{
                          left,
                          top,
                          width: Math.max(width, 88),
                          height: ROW_HEIGHT,
                        }}
                        title={title}
                      >
                        {/* Pin stem dropping from top of lane so the exact
                            day is visually pinpointed. */}
                        <span
                          className={`absolute left-0 top-0 bottom-0 w-0.5 ${track.bar}`}
                        />
                        <span
                          className={
                            "relative pl-2 pr-2 rounded-r-md rounded-l-sm text-white shadow-sm hover:shadow-md hover:brightness-110 transition truncate max-w-full " +
                            track.bar +
                            (it.status === "active" ? " ring-2 ring-brand-300" : "")
                          }
                          style={{ height: ROW_HEIGHT, lineHeight: `${ROW_HEIGHT}px` }}
                        >
                          <span aria-hidden className="mr-1">◆</span>
                          {it.title}
                        </span>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => onOpenItem(it)}
                      className={
                        "absolute group rounded-md text-left text-white text-xs font-medium px-2 shadow-sm hover:shadow-md hover:brightness-110 transition focus:outline-none focus:ring-2 focus:ring-brand-400 " +
                        track.bar +
                        (it.status === "done" ? " opacity-60" : "") +
                        (it.status === "active" ? " ring-2 ring-brand-300" : "")
                      }
                      style={{
                        left,
                        top,
                        width,
                        height: ROW_HEIGHT,
                        lineHeight: `${ROW_HEIGHT}px`,
                      }}
                      title={title}
                    >
                      <span className="block truncate">{it.title}</span>
                    </button>
                  );
                })}
                {trackItems.length === 0 && threads.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-[11px] text-ink-300 italic">
                    当前窗口内没有「{track.label}」的条目
                  </div>
                ) : null}
              </div>
              )
            )}

            {/* Today marker */}
            {todayInWindow ? (
              <div
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{ left: todayLeft }}
              >
                <div className="absolute top-0 bottom-0 w-px bg-brand-500/70" />
                <div className="absolute top-0 -translate-x-1/2 bg-brand-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-b">
                  今天
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="border-t border-ink-200 bg-ink-50/40 px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-600">
        <span className="font-semibold text-ink-700">状态：</span>
        {(Object.keys(STATUS_LABEL) as Array<keyof typeof STATUS_LABEL>).map(
          (s) => (
            <span key={s} className={`chip ${STATUS_CHIP[s]}`}>
              {STATUS_LABEL[s]}
            </span>
          )
        )}
        <span className="flex items-center gap-1.5 ml-2">
          <span className="inline-block h-2 w-6 rounded-sm bg-ink-400 opacity-40" />
          <span>主线（悬停查看摘要）</span>
        </span>
        <span className="ml-auto text-ink-400">
          截止显示为图钉；时间段显示为线段。
        </span>
      </div>
    </div>
      {hoveredThread && hover ? (
        <ThreadHoverCard
          thread={hoveredThread}
          track={trackById[hoveredThread.track]}
          anchorRect={hover.rect}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onOpenItem={onOpenItem}
        />
      ) : null}
    </>
  );
}

// Re-export so other modules can list track ids without importing tracks.ts.
export { trackById };

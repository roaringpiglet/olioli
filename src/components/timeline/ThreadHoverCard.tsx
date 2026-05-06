"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmtDate, fmtMonth } from "@/lib/dates";
import type { TrackMeta } from "@/lib/tracks";
import { threadContentHash, type Thread } from "@/lib/threads";
import type { TimelineItem } from "@/types/db";

interface Props {
  thread: Thread;
  track: TrackMeta;
  anchorRect: DOMRect;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onOpenItem?: (item: TimelineItem) => void;
}

// Module-scope client cache. Keyed by (track, thread, content hash), so the
// AI summary is reused across hovers within a session but automatically
// regenerates whenever any item or goal in the thread has been edited.
// Lives on `globalThis` so HMR doesn't blow it away between reloads during dev.
type CacheEntry = { summary: string; at: number };
function getCache(): Map<string, CacheEntry> {
  const g = globalThis as unknown as {
    __threadSummaryCache?: Map<string, CacheEntry>;
  };
  if (!g.__threadSummaryCache) g.__threadSummaryCache = new Map();
  return g.__threadSummaryCache;
}

function cacheKeyFor(thread: Thread, hash: string): string {
  return `${thread.track}::${thread.name.toLowerCase()}::${hash}`;
}

// Also an in-flight de-dup so two hovers of the same thread don't double-spend.
function getInflight(): Map<string, Promise<string>> {
  const g = globalThis as unknown as {
    __threadSummaryInflight?: Map<string, Promise<string>>;
  };
  if (!g.__threadSummaryInflight) g.__threadSummaryInflight = new Map();
  return g.__threadSummaryInflight;
}

export function ThreadHoverCard({
  thread,
  track,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
  onOpenItem,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    left: number;
    top: number;
    placement: "below" | "above";
  } | null>(null);

  const hash = threadContentHash(thread);
  const cacheKey = cacheKeyFor(thread, hash);

  const cached = getCache().get(cacheKey)?.summary ?? null;
  const [summary, setSummary] = useState<string | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  // Kick off the fetch automatically as soon as the card mounts (or whenever
  // a fresh hash means the cached summary is stale). We use a cross-hover
  // inflight map so opening the same thread twice in quick succession doesn't
  // double-fire the request.
  useEffect(() => {
    const cache = getCache();
    const hit = cache.get(cacheKey);
    if (hit) {
      setSummary(hit.summary);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const inflight = getInflight();
    let p = inflight.get(cacheKey);
    if (!p) {
      p = (async () => {
        const resp = await fetch("/api/ai/timeline-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ track: thread.track, thread: thread.name }),
        });
        const data = (await resp.json()) as {
          summary?: string;
          error?: string;
        };
        if (!resp.ok) throw new Error(data.error ?? `HTTP ${resp.status}`);
        const text = (data.summary ?? "").trim();
        cache.set(cacheKey, { summary: text, at: Date.now() });
        return text;
      })();
      inflight.set(cacheKey, p);
      // clean up inflight once settled
      p.finally(() => inflight.delete(cacheKey));
    }

    p.then((text) => {
      if (cancelled) return;
      setSummary(text);
      setLoading(false);
    }).catch((e: unknown) => {
      if (cancelled) return;
      setError((e as Error).message);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, thread.track, thread.name]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = rect.width;
    const h = rect.height;

    const centerX = anchorRect.left + anchorRect.width / 2;
    let left = centerX - w / 2;
    left = Math.max(8, Math.min(left, vw - w - 8));

    const spaceBelow = vh - anchorRect.bottom;
    const spaceAbove = anchorRect.top;
    let top: number;
    let placement: "below" | "above";
    if (spaceBelow >= h + 16 || spaceBelow >= spaceAbove) {
      top = Math.min(anchorRect.bottom + 8, vh - h - 8);
      placement = "below";
    } else {
      top = Math.max(8, anchorRect.top - h - 8);
      placement = "above";
    }
    setPos({ left, top, placement });
  }, [anchorRect, summary, loading, error]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onMouseLeave();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onMouseLeave]);

  if (typeof document === "undefined") return null;

  // Sort items: deadlines by date, then ranges by start.
  const items = [...thread.items].sort((a, b) =>
    a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0
  );

  const hasAny = items.length > 0 || thread.goals.length > 0;

  return createPortal(
    <div
      ref={cardRef}
      role="dialog"
      aria-label={`主线：${thread.name}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "fixed",
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: 360,
        maxHeight: "min(70vh, 560px)",
        zIndex: 60,
        opacity: pos ? 1 : 0,
        transition: "opacity 120ms ease-out",
      }}
      className="rounded-lg border border-ink-200 bg-white shadow-2xl text-sm overflow-hidden flex flex-col"
    >
      <div className={`h-1.5 ${track.bar}`} />

      <div className="p-4 space-y-3 overflow-y-auto">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-ink-500 font-semibold">
            <span className={`h-2 w-2 rounded-full ${track.dot}`} />
            {track.label}
            <span className="text-ink-300">·</span>
            <span className="text-ink-500 normal-case tracking-normal font-medium">
              {fmtDate(thread.startISO)} – {fmtDate(thread.endISO)}
            </span>
          </div>
          <div className="mt-1 text-ink-900 font-semibold leading-snug text-base">
            {thread.name}
          </div>
        </div>

        <div className="rounded-md bg-ink-50/70 border border-ink-100 p-3 text-[12.5px] leading-relaxed text-ink-800 min-h-[60px]">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
              AI 摘要
            </div>
            {loading ? (
              <span className="text-[10px] text-ink-400 italic">
                思考中……
              </span>
            ) : null}
          </div>
          {error ? (
            <div className="text-[12px] text-rose-600">{error}</div>
          ) : summary ? (
            <div className="whitespace-pre-wrap">{summary}</div>
          ) : loading ? (
            <SummarySkeleton />
          ) : (
            <div className="text-ink-400 italic text-[12px]">
              往这条主线里加点内容，才能生成摘要。
            </div>
          )}
        </div>

        {thread.goals.length > 0 ? (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-500 font-semibold mb-1">
              本月目标
            </div>
            <ul className="space-y-1">
              {thread.goals
                .slice()
                .sort((a, b) => (a.month < b.month ? -1 : 1))
                .map((g) => (
                  <li key={g.id} className="text-[12px] text-ink-700">
                    <span className="font-medium text-ink-900">
                      {fmtMonth(g.month)}
                    </span>
                    <span className="text-ink-500"> — {g.title}</span>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        {items.length > 0 ? (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-500 font-semibold mb-1">
              时间线条目
            </div>
            <ul className="space-y-1">
              {items.slice(0, 8).map((it) => {
                const isDeadline = it.start_date === it.end_date;
                const when = isDeadline
                  ? `截止 · ${fmtDate(it.start_date)}`
                  : `${fmtDate(it.start_date)} – ${fmtDate(it.end_date)}`;
                return (
                  <li key={it.id} className="text-[12px] text-ink-700">
                    <button
                      type="button"
                      onClick={() => onOpenItem?.(it)}
                      className="text-left hover:underline w-full"
                    >
                      <span className="font-medium text-ink-900">
                        {isDeadline ? "◆ " : ""}
                        {it.title}
                      </span>
                      <span className="text-ink-500"> — {when}</span>
                    </button>
                  </li>
                );
              })}
              {items.length > 8 ? (
                <li className="text-[11px] text-ink-400 italic">
                  还有 {items.length - 8} 条……
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {!hasAny ? (
          <div className="text-ink-400 italic text-[12px]">
            这条主线里暂时还没有内容。
          </div>
        ) : null}
      </div>

      <span
        aria-hidden
        className="absolute w-2.5 h-2.5 bg-white border border-ink-200 rotate-45"
        style={
          pos?.placement === "above"
            ? {
                left: Math.max(
                  12,
                  Math.min(
                    anchorRect.left + anchorRect.width / 2 - (pos?.left ?? 0) - 5,
                    360 - 22
                  )
                ),
                bottom: -5,
                borderTop: "none",
                borderLeft: "none",
              }
            : {
                left: Math.max(
                  12,
                  Math.min(
                    anchorRect.left + anchorRect.width / 2 - (pos?.left ?? 0) - 5,
                    360 - 22
                  )
                ),
                top: -5,
                borderBottom: "none",
                borderRight: "none",
              }
        }
      />
    </div>,
    document.body
  );
}

function SummarySkeleton() {
  return (
    <div className="space-y-1.5 animate-pulse">
      <div className="h-2 bg-ink-200 rounded w-[92%]" />
      <div className="h-2 bg-ink-200 rounded w-[78%]" />
      <div className="h-2 bg-ink-200 rounded w-[85%]" />
    </div>
  );
}

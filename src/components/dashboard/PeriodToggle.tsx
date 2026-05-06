"use client";
import Link from "next/link";

interface Props {
  label: string;
  prevHref: string;
  nextHref: string;
  todayHref: string;
  isToday: boolean;
}

export function PeriodToggle({ label, prevHref, nextHref, todayHref, isToday }: Props) {
  return (
    <div className="inline-flex items-center gap-1">
      <Link href={prevHref} className="btn btn-ghost px-2 py-1" scroll={false} aria-label="上一期">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
          <path d="M10.5 2L4.5 8l6 6V2z" />
        </svg>
      </Link>
      <span className="text-sm font-medium text-ink-900 px-1 min-w-[7rem] text-center">
        {label}
      </span>
      <Link href={nextHref} className="btn btn-ghost px-2 py-1" scroll={false} aria-label="下一期">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
          <path d="M5.5 2v12l6-6z" />
        </svg>
      </Link>
      {!isToday && (
        <Link href={todayHref} className="btn btn-ghost text-xs px-2 py-1" scroll={false}>
          回到今天
        </Link>
      )}
    </div>
  );
}

import { loadSession } from "@/lib/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { TopBar } from "@/components/TopBar";
import { TimelineClient } from "@/components/timeline/TimelineClient";
import {
  addMonths,
  monthStart,
  today,
  toISO,
} from "@/lib/dates";
import type { MonthlyGoal, Profile, TimelineItem } from "@/types/db";

interface PageProps {
  searchParams: { from?: string; months?: string };
}

// Total months we render at once. The view defaults to today on the left
// edge; PAST_MONTHS is loaded behind today so users can scroll back to see
// what already happened. Both the past buffer and the future window are
// rendered into the same horizontally scrollable canvas.
const PAST_MONTHS = 3;
const DEFAULT_FUTURE_MONTHS = 12;
const MIN_MONTHS = PAST_MONTHS + 3;
const MAX_MONTHS = PAST_MONTHS + 36;

export default async function TimelinePage({ searchParams }: PageProps) {
  const { profile, studentId } = await loadSession();
  if (!studentId) return <UnlinkedPanel profile={profile} />;

  const todayMonthStartISO = toISO(monthStart(today()));
  const defaultFromISO = toISO(addMonths(monthStart(today()), -PAST_MONTHS));
  const fromISO = searchParams.from
    ? toISO(monthStart(new Date(searchParams.from)))
    : defaultFromISO;
  const monthsParam = Number(searchParams.months);
  const months = Number.isFinite(monthsParam)
    ? Math.min(Math.max(monthsParam, MIN_MONTHS), MAX_MONTHS)
    : PAST_MONTHS + DEFAULT_FUTURE_MONTHS;

  const fromDate = new Date(fromISO);
  const endExclusive = addMonths(fromDate, months);
  const endISO = toISO(endExclusive);

  const db = createSupabaseAdminClient();

  const [itemsRes, goalsRes, studentRes] = await Promise.all([
    // Any item that overlaps [from, end) — i.e. start < end AND end >= from.
    db
      .from("timeline_items")
      .select("*")
      .eq("student_id", studentId)
      .lt("start_date", endISO)
      .gte("end_date", fromISO)
      .order("start_date", { ascending: true }),
    db
      .from("monthly_goals")
      .select("*")
      .eq("student_id", studentId)
      .gte("month", fromISO)
      .lt("month", endISO)
      .order("month", { ascending: true })
      .order("order", { ascending: true }),
    db
      .from("profiles")
      .select("full_name")
      .eq("id", studentId)
      .maybeSingle<{ full_name: string | null }>(),
  ]);

  if (itemsRes.error) throw itemsRes.error;
  if (goalsRes.error) throw goalsRes.error;

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        profile={profile}
        studentName={studentRes.data?.full_name ?? null}
      />
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-6">
        <TimelineClient
          profile={profile}
          studentId={studentId}
          items={(itemsRes.data ?? []) as TimelineItem[]}
          goals={(goalsRes.data ?? []) as MonthlyGoal[]}
          fromISO={fromISO}
          months={months}
          pastMonths={PAST_MONTHS}
          todayISO={toISO(today())}
          todayMonthISO={todayMonthStartISO}
          defaultFromISO={defaultFromISO}
          defaultMonths={PAST_MONTHS + DEFAULT_FUTURE_MONTHS}
        />
      </main>
      <footer className="border-t border-ink-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-3 text-xs text-ink-400">
          升学 OS · v0.2
        </div>
      </footer>
    </div>
  );
}

function UnlinkedPanel({ profile }: { profile: Profile }) {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar profile={profile} />
      <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-10">
        <div className="card p-6">
          <h2 className="text-base font-semibold text-ink-900">
            你还没有关联到学生
          </h2>
          <p className="text-sm text-ink-600 mt-2">
            你的账号已通过审批，但还没有与任何学生的计划关联起来。请联系管理者确认你支持的学生。
          </p>
        </div>
      </main>
    </div>
  );
}

export const dynamic = "force-dynamic";

import { loadSession } from "@/lib/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { TopBar } from "@/components/TopBar";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import {
  addMonths,
  addWeeks,
  monthStart,
  today,
  toISO,
  weekStart,
} from "@/lib/dates";
import type {
  MonthlyGoal,
  Stage,
  TimelineItem,
  WeeklyTodo,
  Profile,
} from "@/types/db";

interface PageProps {
  searchParams: { week?: string; month?: string };
}

// Loads just enough data for the dashboard's current selection. We fetch:
//   - the active stage for today's date
//   - monthly goals for the selected month (default: current month)
//   - weekly todos for the selected week (default: current Monday)
// Week and month selection are URL-driven so the Back button works.
export default async function DashboardPage({ searchParams }: PageProps) {
  const { profile, studentId } = await loadSession();

  if (!studentId) return <UnlinkedPanel profile={profile} />;

  const todayISO = toISO(today());
  const selectedWeekISO = searchParams.week ?? toISO(weekStart(today()));
  const selectedMonthISO = searchParams.month ?? toISO(monthStart(today()));

  // Use the service-role client so RLS doesn't block counselors/parents who
  // depend on support_links; all access is authorized in loadSession().
  const db = createSupabaseAdminClient();

  // Window covering [selectedMonth, selectedMonth + 1mo) for timeline
  // overlap queries.
  const monthEndExclusiveISO = toISO(addMonths(new Date(selectedMonthISO), 1));

  const [stageRes, goalsRes, todosRes, studentRes, timelineRes] = await Promise.all([
    db
      .from("stages")
      .select("*")
      .eq("student_id", studentId)
      .lte("start_date", todayISO)
      .gte("end_date", todayISO)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle<Stage>(),
    db
      .from("monthly_goals")
      .select("*")
      .eq("student_id", studentId)
      .eq("month", selectedMonthISO)
      .order("order", { ascending: true })
      .order("created_at", { ascending: true }),
    db
      .from("weekly_todos")
      .select("*")
      .eq("student_id", studentId)
      .eq("week_start", selectedWeekISO)
      .order("order", { ascending: true })
      .order("created_at", { ascending: true }),
    db.from("profiles").select("full_name").eq("id", studentId).maybeSingle<{
      full_name: string | null;
    }>(),
    // Timeline items overlapping the selected month — used for cross-linking
    // to monthly goals on the dashboard.
    db
      .from("timeline_items")
      .select("*")
      .eq("student_id", studentId)
      .lt("start_date", monthEndExclusiveISO)
      .gte("end_date", selectedMonthISO)
      .order("start_date", { ascending: true }),
  ]);

  if (stageRes.error) throw stageRes.error;
  if (goalsRes.error) throw goalsRes.error;
  if (todosRes.error) throw todosRes.error;
  if (timelineRes.error) throw timelineRes.error;

  // Also pull goals for the selected week's month so todos can reference
  // their linked goal by title even when the two differ.
  const todoGoalMonth = toISO(monthStart(new Date(selectedWeekISO)));
  const goalsForTodos =
    todoGoalMonth === selectedMonthISO
      ? { data: goalsRes.data ?? [] }
      : await db
          .from("monthly_goals")
          .select("*")
          .eq("student_id", studentId)
          .eq("month", todoGoalMonth);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar profile={profile} studentName={studentRes.data?.full_name ?? null} />
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-6">
        <DashboardClient
          profile={profile}
          studentId={studentId}
          stage={stageRes.data ?? null}
          goals={(goalsRes.data ?? []) as MonthlyGoal[]}
          todos={(todosRes.data ?? []) as WeeklyTodo[]}
          goalsForTodos={(goalsForTodos.data ?? []) as MonthlyGoal[]}
          timelineItems={(timelineRes.data ?? []) as TimelineItem[]}
          timelineWindowFrom={selectedMonthISO}
          selectedWeek={selectedWeekISO}
          selectedMonth={selectedMonthISO}
          todayWeek={toISO(weekStart(today()))}
          todayMonth={toISO(monthStart(today()))}
          nextWeek={toISO(addWeeks(new Date(selectedWeekISO), 1))}
          prevWeek={toISO(addWeeks(new Date(selectedWeekISO), -1))}
          nextMonth={toISO(addMonths(new Date(selectedMonthISO), 1))}
          prevMonth={toISO(addMonths(new Date(selectedMonthISO), -1))}
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

// Force this page to re-run on each request so the dashboard stays fresh
// after server-action mutations.
export const dynamic = "force-dynamic";

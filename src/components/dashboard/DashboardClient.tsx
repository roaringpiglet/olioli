"use client";
import type {
  MonthlyGoal,
  Profile,
  Stage,
  TimelineItem,
  WeeklyTodo,
} from "@/types/db";
import { StageOverview } from "./StageOverview";
import { MonthlyGoals } from "./MonthlyGoals";
import { WeeklyTodos } from "./WeeklyTodos";
import { roleBlurb } from "@/lib/permissions";

interface Props {
  profile: Profile;
  studentId: string;
  stage: Stage | null;
  goals: MonthlyGoal[];
  todos: WeeklyTodo[];
  goalsForTodos: MonthlyGoal[];
  timelineItems: TimelineItem[];
  timelineWindowFrom: string;
  selectedWeek: string;
  selectedMonth: string;
  todayWeek: string;
  todayMonth: string;
  nextWeek: string;
  prevWeek: string;
  nextMonth: string;
  prevMonth: string;
}

export function DashboardClient(props: Props) {
  const { profile } = props;
  return (
    <div className="space-y-5">
      <p className="text-xs text-ink-600">{roleBlurb[profile.role]}</p>

      <StageOverview profile={profile} stage={props.stage} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <MonthlyGoals
          profile={profile}
          goals={props.goals}
          timelineItems={props.timelineItems}
          timelineWindowFrom={props.timelineWindowFrom}
          selectedMonth={props.selectedMonth}
          todayMonth={props.todayMonth}
          prevMonth={props.prevMonth}
          nextMonth={props.nextMonth}
        />
        <WeeklyTodos
          profile={profile}
          todos={props.todos}
          goals={props.goalsForTodos}
          selectedWeek={props.selectedWeek}
          todayWeek={props.todayWeek}
          prevWeek={props.prevWeek}
          nextWeek={props.nextWeek}
        />
      </div>
    </div>
  );
}

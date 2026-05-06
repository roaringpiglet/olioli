"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type {
  MonthlyGoal,
  Profile,
  TimelineTrack,
  TodoStatus,
  WeeklyTodo,
} from "@/types/db";
import { can } from "@/lib/permissions";
import { fmtWeekRange } from "@/lib/dates";
import { TrackChip, TrackSelect } from "@/components/TrackChip";
import { PeriodToggle } from "./PeriodToggle";
import { createTodo, deleteTodo, updateTodo } from "@/app/actions/todos";

interface Props {
  profile: Profile;
  todos: WeeklyTodo[];
  goals: MonthlyGoal[];
  selectedWeek: string;
  todayWeek: string;
  prevWeek: string;
  nextWeek: string;
}

export function WeeklyTodos({
  profile,
  todos,
  goals,
  selectedWeek,
  todayWeek,
  prevWeek,
  nextWeek,
}: Props) {
  const canManage = can.manageTodos(profile.role);
  const router = useRouter();
  const t = useTranslations();
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const link = (week: string) => `/?week=${week}`;

  const grouped: Record<TodoStatus, WeeklyTodo[]> = {
    todo: [],
    in_progress: [],
    done: [],
  };
  todos.forEach((t) => grouped[t.status].push(t));

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
            {t("dashboard.weekly.heading")}
          </div>
          <h2 className="text-base font-semibold text-ink-900 mt-0.5">
            {fmtWeekRange(selectedWeek)}
          </h2>
          <p className="text-xs text-ink-600 mt-0.5">
            {t("dashboard.weekly.subheading")}
          </p>
        </div>
        <PeriodToggle
          label={fmtWeekRange(selectedWeek)}
          prevHref={link(prevWeek)}
          nextHref={link(nextWeek)}
          todayHref={link(todayWeek)}
          isToday={selectedWeek === todayWeek}
        />
      </div>

      {err && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2.5 py-2 mb-3">
          {err}
        </div>
      )}

      <div className="space-y-1.5">
        <TodoSection
          label={t("statuses.todo.todo")}
          tone="ink"
          todos={grouped.todo}
          goals={goals}
          profile={profile}
          setErr={setErr}
        />
        <TodoSection
          label={t("statuses.todo.in_progress")}
          tone="brand"
          todos={grouped.in_progress}
          goals={goals}
          profile={profile}
          setErr={setErr}
        />
        <TodoSection
          label={t("statuses.todo.done")}
          tone="emerald"
          todos={grouped.done}
          goals={goals}
          profile={profile}
          setErr={setErr}
        />
      </div>

      {todos.length === 0 && !adding && (
        <p className="text-sm text-ink-600 text-center py-6">
          {t("dashboard.weekly.empty")}
        </p>
      )}

      {adding && (
        <TodoCreator
          weekStart={selectedWeek}
          goals={goals}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            router.refresh();
          }}
          setErr={setErr}
        />
      )}

      {canManage && !adding && (
        <button
          className="btn btn-ghost mt-3 w-full border border-dashed border-ink-200 text-ink-600 hover:text-ink-900"
          onClick={() => setAdding(true)}
        >
          {t("dashboard.weekly.add")}
        </button>
      )}
    </div>
  );
}

function TodoSection({
  label,
  tone,
  todos,
  goals,
  profile,
  setErr,
}: {
  label: string;
  tone: "ink" | "brand" | "emerald";
  todos: WeeklyTodo[];
  goals: MonthlyGoal[];
  profile: Profile;
  setErr: (e: string | null) => void;
}) {
  if (todos.length === 0) return null;
  const dotColor =
    tone === "brand"
      ? "bg-brand-500"
      : tone === "emerald"
        ? "bg-emerald-500"
        : "bg-ink-400";
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
        <h3 className="text-[11px] font-semibold text-ink-600 uppercase tracking-wide">
          {label}
        </h3>
        <span className="text-[11px] text-ink-400">{todos.length}</span>
      </div>
      <div className="space-y-1.5">
        {todos.map((t) => (
          <TodoRow
            key={t.id}
            todo={t}
            goal={goals.find((g) => g.id === t.monthly_goal_id)}
            goals={goals}
            profile={profile}
            setErr={setErr}
          />
        ))}
      </div>
    </div>
  );
}

function TodoRow({
  todo,
  goal,
  goals,
  profile,
  setErr,
}: {
  todo: WeeklyTodo;
  goal: MonthlyGoal | undefined;
  goals: MonthlyGoal[];
  profile: Profile;
  setErr: (e: string | null) => void;
}) {
  const router = useRouter();
  const t = useTranslations();
  const [, startTransition] = useTransition();
  const canManage = can.manageTodos(profile.role);
  const canUpdate =
    canManage ||
    (profile.role === "student" && profile.id === todo.student_id);
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(todo.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(todo.title);
  const [savingTitle, setSavingTitle] = useState(false);

  const STATUSES: { value: TodoStatus; label: string }[] = [
    { value: "todo", label: t("statuses.todo.todo") },
    { value: "in_progress", label: t("statuses.todo.in_progress") },
    { value: "done", label: t("statuses.todo.done") },
  ];

  const setStatus = (status: TodoStatus) => {
    if (!canUpdate) return;
    setErr(null);
    startTransition(async () => {
      try {
        await updateTodo({ id: todo.id, status });
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  const toggleDone = () => {
    setStatus(todo.status === "done" ? "todo" : "done");
  };

  const saveNotes = async () => {
    setErr(null);
    setSavingNotes(true);
    try {
      await updateTodo({ id: todo.id, notes });
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSavingNotes(false);
    }
  };

  const saveTitle = async () => {
    const next = titleDraft.trim();
    if (!next) {
      setErr("请填写标题");
      return;
    }
    if (next === todo.title) {
      setEditingTitle(false);
      return;
    }
    setErr(null);
    setSavingTitle(true);
    try {
      await updateTodo({ id: todo.id, title: next });
      setEditingTitle(false);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSavingTitle(false);
    }
  };

  const cancelTitleEdit = () => {
    setTitleDraft(todo.title);
    setEditingTitle(false);
  };

  const startTitleEdit = () => {
    if (!canUpdate) return;
    setTitleDraft(todo.title);
    setEditingTitle(true);
    setExpanded(true);
  };

  const removeTodo = () => {
    if (!confirm(`确认删除「${todo.title}」？`)) return;
    setErr(null);
    startTransition(async () => {
      try {
        await deleteTodo(todo.id);
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  const done = todo.status === "done";

  return (
    <div
      className={[
        "border rounded-lg transition",
        done
          ? "bg-ink-50/50 border-ink-200"
          : "bg-white border-ink-200 hover:border-ink-400/40",
      ].join(" ")}
    >
      <div className="flex items-start gap-3 px-3 py-2">
        <button
          disabled={!canUpdate}
          onClick={toggleDone}
          className={[
            "mt-0.5 h-5 w-5 rounded-md border flex items-center justify-center shrink-0 transition",
            done
              ? "bg-emerald-500 border-emerald-500 text-white"
              : "border-ink-200 hover:border-brand-500",
            canUpdate ? "cursor-pointer" : "cursor-not-allowed opacity-50",
          ].join(" ")}
          title={done ? "标记为未完成" : "标记为已完成"}
          aria-label="切换完成状态"
        >
          {done && (
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none">
              <path
                d="M3 8l3.5 3.5L13 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {editingTitle && canUpdate ? (
              <input
                className="input py-0.5 text-sm font-medium flex-1 min-w-[180px]"
                value={titleDraft}
                autoFocus
                disabled={savingTitle}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveTitle();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelTitleEdit();
                  }
                }}
              />
            ) : (
              <button
                type="button"
                onClick={startTitleEdit}
                disabled={!canUpdate}
                className={[
                  "text-sm font-medium text-left",
                  done ? "text-ink-400 line-through" : "text-ink-900",
                  canUpdate
                    ? "hover:text-brand-600 cursor-text"
                    : "cursor-default",
                ].join(" ")}
                title={canUpdate ? "点击编辑标题" : undefined}
              >
                {todo.title}
              </button>
            )}
            <TrackChip track={todo.track ?? goal?.track ?? null} muted={done} />
            {goal && (
              <span
                className="chip bg-brand-50 text-brand-700"
                title={goal.title}
              >
                ↳ {goal.title}
              </span>
            )}
          </div>
          {todo.notes && !expanded && (
            <p className="text-xs text-ink-600 mt-0.5 line-clamp-2">
              {todo.notes}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {editingTitle && canUpdate ? (
            <>
              <button
                className="btn btn-primary px-2 py-1 text-xs"
                onClick={saveTitle}
                disabled={savingTitle || !titleDraft.trim()}
              >
                {savingTitle ? t("common.saving") : t("common.save")}
              </button>
              <button
                className="btn btn-ghost px-2 py-1 text-xs"
                onClick={cancelTitleEdit}
                disabled={savingTitle}
              >
                {t("common.cancel")}
              </button>
            </>
          ) : (
            <>
              {canUpdate && (
                <select
                  value={todo.status}
                  onChange={(e) => setStatus(e.target.value as TodoStatus)}
                  className="input py-0.5 text-xs w-[105px]"
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              )}
              {canUpdate && (
                <button
                  className="btn btn-ghost px-2 py-1 text-xs"
                  onClick={startTitleEdit}
                  title="编辑标题"
                  aria-label="编辑标题"
                >
                  编辑
                </button>
              )}
              <button
                className="btn btn-ghost px-2 py-1 text-xs"
                onClick={() => setExpanded((e) => !e)}
              >
                {expanded ? "收起" : "备注"}
              </button>
              {canManage && (
                <button
                  className="btn btn-ghost px-2 py-1 text-xs text-ink-400 hover:text-rose-600"
                  onClick={removeTodo}
                  aria-label="删除"
                >
                  ×
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-ink-200 px-3 py-2 bg-ink-50/40">
          {canManage && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <GoalPicker todo={todo} goals={goals} setErr={setErr} />
              <TrackPicker todo={todo} setErr={setErr} />
            </div>
          )}
          <label className="label mt-2">{t("dashboard.weekly.notesLabel")}</label>
          <textarea
            className="input min-h-[70px] bg-white"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canUpdate}
            placeholder={
              canUpdate ? t("dashboard.weekly.notesPlaceholder") : "暂无备注。"
            }
          />
          {canUpdate && (
            <div className="flex justify-end mt-2">
              <button
                className="btn btn-primary text-xs"
                onClick={saveNotes}
                disabled={savingNotes || notes === (todo.notes ?? "")}
              >
                {savingNotes ? t("common.saving") : "保存备注"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GoalPicker({
  todo,
  goals,
  setErr,
}: {
  todo: WeeklyTodo;
  goals: MonthlyGoal[];
  setErr: (e: string | null) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState<string>(todo.monthly_goal_id ?? "");

  const save = async (v: string) => {
    setValue(v);
    setErr(null);
    setBusy(true);
    try {
      await updateTodo({ id: todo.id, monthlyGoalId: v || null });
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label className="label">关联的本月目标</label>
      <select
        className="input bg-white"
        value={value}
        disabled={busy}
        onChange={(e) => save(e.target.value)}
      >
        <option value="">（无）</option>
        {goals.map((g) => (
          <option key={g.id} value={g.id}>
            {g.title}
          </option>
        ))}
      </select>
    </div>
  );
}

function TrackPicker({
  todo,
  setErr,
}: {
  todo: WeeklyTodo;
  setErr: (e: string | null) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState<TimelineTrack | null>(todo.track);

  const save = async (next: TimelineTrack | null) => {
    setValue(next);
    setErr(null);
    setBusy(true);
    try {
      await updateTodo({ id: todo.id, track: next });
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label className="label">分类</label>
      <TrackSelect value={value} onChange={save} disabled={busy} />
    </div>
  );
}

function TodoCreator({
  weekStart,
  goals,
  onCancel,
  onSaved,
  setErr,
}: {
  weekStart: string;
  goals: MonthlyGoal[];
  onCancel: () => void;
  onSaved: () => void;
  setErr: (e: string | null) => void;
}) {
  const t = useTranslations();
  const [title, setTitle] = useState("");
  const [goalId, setGoalId] = useState("");
  const [track, setTrack] = useState<TimelineTrack | null>(null);
  // Remembers whether the user manually picked a category. Until they
  // do, selecting a goal auto-fills the track from the goal.
  const [trackDirty, setTrackDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const onGoalChange = (id: string) => {
    setGoalId(id);
    if (!trackDirty) {
      const goal = goals.find((g) => g.id === id);
      setTrack(goal?.track ?? null);
    }
  };

  const save = async () => {
    if (!title.trim()) return;
    setErr(null);
    setBusy(true);
    try {
      await createTodo({
        weekStart,
        title,
        monthlyGoalId: goalId || undefined,
        track,
      });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 border border-brand-200 rounded-lg p-3 bg-brand-50/40 space-y-2">
      <input
        className="input bg-white"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("dashboard.weekly.placeholder")}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select
          className="input bg-white"
          value={goalId}
          onChange={(e) => onGoalChange(e.target.value)}
        >
          <option value="">关联到本月目标（可选）</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
        <TrackSelect
          value={track}
          onChange={(tk) => {
            setTrack(tk);
            setTrackDirty(true);
          }}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn" onClick={onCancel} disabled={busy}>
          {t("common.cancel")}
        </button>
        <button
          className="btn btn-primary"
          onClick={save}
          disabled={busy || !title.trim()}
        >
          {busy ? "添加中……" : t("dashboard.weekly.add").replace("+ ", "")}
        </button>
      </div>
    </div>
  );
}

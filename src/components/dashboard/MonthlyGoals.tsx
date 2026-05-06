"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type {
  MonthlyGoal,
  Profile,
  TimelineItem,
  TimelineTrack,
} from "@/types/db";
import { can } from "@/lib/permissions";
import { fmtMonth, fmtTimeAgo } from "@/lib/dates";
import { trackById } from "@/lib/tracks";
import { TrackChip, TrackSelect } from "@/components/TrackChip";
import { threadSuggestions } from "@/lib/threads";
import { PeriodToggle } from "./PeriodToggle";
import {
  deleteMonthlyGoal,
  reorderMonthlyGoals,
  saveMonthlyGoal,
  setMonthlyGoalAchievement,
} from "@/app/actions/goals";

interface Props {
  profile: Profile;
  goals: MonthlyGoal[];
  timelineItems: TimelineItem[];
  timelineWindowFrom: string;
  selectedMonth: string; // YYYY-MM-01
  todayMonth: string;
  prevMonth: string;
  nextMonth: string;
}

export function MonthlyGoals({
  profile,
  goals,
  timelineItems,
  timelineWindowFrom,
  selectedMonth,
  todayMonth,
  prevMonth,
  nextMonth,
}: Props) {
  const canEdit = can.editMonthlyGoals(profile.role);
  const canMark = can.markGoalAchievement(profile.role);
  const router = useRouter();
  const t = useTranslations();
  const [, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [achievingId, setAchievingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const link = (month: string) => `/?month=${month}`;
  const isFuture = selectedMonth > todayMonth;

  const itemsByGoal = useMemo(() => {
    const m = new Map<string, TimelineItem[]>();
    for (const it of timelineItems) {
      if (!it.monthly_goal_id) continue;
      const arr = m.get(it.monthly_goal_id) ?? [];
      arr.push(it);
      m.set(it.monthly_goal_id, arr);
    }
    return m;
  }, [timelineItems]);

  const unlinkedTimelineCount = timelineItems.filter(
    (it) => !it.monthly_goal_id
  ).length;
  const timelineHref = `/timeline?from=${timelineWindowFrom}&months=6`;

  const handleDelete = (id: string) => {
    if (!confirm("确认删除这条目标？")) return;
    setBusyId(id);
    setErr(null);
    startTransition(async () => {
      try {
        await deleteMonthlyGoal(id);
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusyId(null);
      }
    });
  };

  const toggleAchieved = (g: MonthlyGoal) => {
    if (!canMark) return;
    // Students can only toggle their own goal. The action enforces this
    // server-side, but we silence the UI for parents anyway.
    if (profile.role === "student" && g.student_id !== profile.id) return;
    const next = !g.achieved_at;
    setAchievingId(g.id);
    setErr(null);
    startTransition(async () => {
      try {
        await setMonthlyGoalAchievement({ id: g.id, achieved: next });
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setAchievingId(null);
      }
    });
  };

  const move = (id: string, dir: -1 | 1) => {
    const idx = goals.findIndex((g) => g.id === id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= goals.length) return;
    const next = goals.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    startTransition(async () => {
      try {
        await reorderMonthlyGoals(next.map((g) => g.id));
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
            {t("dashboard.monthly.heading")}
            {isFuture && (
              <span className="text-brand-600"> · 提前规划</span>
            )}
          </div>
          <h2 className="text-base font-semibold text-ink-900 mt-0.5">
            {fmtMonth(selectedMonth)}
          </h2>
          <p className="text-xs text-ink-600 mt-0.5">
            {t("dashboard.monthly.subheading")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodToggle
            label={fmtMonth(selectedMonth)}
            prevHref={link(prevMonth)}
            nextHref={link(nextMonth)}
            todayHref={link(todayMonth)}
            isToday={selectedMonth === todayMonth}
          />
        </div>
      </div>

      <div className="space-y-2">
        {goals.map((g, i) =>
          editingId === g.id ? (
            <GoalEditor
              key={g.id}
              initial={g}
              allGoals={goals}
              allItems={timelineItems}
              onCancel={() => setEditingId(null)}
              onSaved={() => {
                setEditingId(null);
                router.refresh();
              }}
              setErr={setErr}
            />
          ) : (
            <div
              key={g.id}
              className={[
                "border rounded-lg p-3 transition",
                g.achieved_at
                  ? "border-emerald-200 bg-emerald-50/40"
                  : "border-ink-200 bg-white",
              ].join(" ")}
            >
              <div className="flex items-start gap-3">
                <GoalCheckbox
                  goal={g}
                  index={i}
                  canMark={
                    canMark &&
                    !(profile.role === "student" && g.student_id !== profile.id)
                  }
                  busy={achievingId === g.id}
                  onToggle={() => toggleAchieved(g)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        "text-sm font-medium",
                        g.achieved_at
                          ? "text-ink-400 line-through"
                          : "text-ink-900",
                      ].join(" ")}
                    >
                      {g.title}
                    </span>
                    <TrackChip track={g.track} muted={!!g.achieved_at} />
                    {g.achieved_at && (
                      <span className="chip bg-emerald-100 text-emerald-700">
                        ✓ 已达成
                      </span>
                    )}
                  </div>
                  {g.description && (
                    <p
                      className={[
                        "text-xs mt-0.5 leading-relaxed",
                        g.achieved_at ? "text-ink-400" : "text-ink-600",
                      ].join(" ")}
                    >
                      {g.description}
                    </p>
                  )}
                  {g.achieved_at && (
                    <p className="text-[11px] text-emerald-700 mt-1">
                      标记于 {fmtTimeAgo(g.achieved_at)}
                      {g.achieved_by === profile.id ? "（由你）" : ""}
                    </p>
                  )}
                  <TimelineRefs
                    items={itemsByGoal.get(g.id) ?? []}
                    timelineHref={timelineHref}
                  />
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {canMark &&
                    !(
                      profile.role === "student" &&
                      g.student_id !== profile.id
                    ) && (
                      <button
                        type="button"
                        className={[
                          "btn text-xs whitespace-nowrap",
                          g.achieved_at
                            ? "btn-ghost text-emerald-700 hover:text-emerald-900"
                            : "btn-ghost border border-emerald-200 text-emerald-700 hover:bg-emerald-50",
                        ].join(" ")}
                        onClick={() => toggleAchieved(g)}
                        disabled={achievingId === g.id}
                        title={
                          g.achieved_at
                            ? "取消「已达成」"
                            : "标记为已达成"
                        }
                      >
                        {achievingId === g.id
                          ? "保存中……"
                          : g.achieved_at
                            ? "✓ 已达成"
                            : "标记达成"}
                      </button>
                    )}
                  {canEdit && (
                    <>
                      <button
                        className="btn btn-ghost px-1.5 py-1 text-ink-400 hover:text-ink-900 disabled:opacity-30"
                        onClick={() => move(g.id, -1)}
                        disabled={i === 0}
                        aria-label="上移"
                      >
                        ↑
                      </button>
                      <button
                        className="btn btn-ghost px-1.5 py-1 text-ink-400 hover:text-ink-900 disabled:opacity-30"
                        onClick={() => move(g.id, 1)}
                        disabled={i === goals.length - 1}
                        aria-label="下移"
                      >
                        ↓
                      </button>
                      <button
                        className="btn btn-ghost text-xs"
                        onClick={() => setEditingId(g.id)}
                      >
                        {t("common.edit")}
                      </button>
                      <button
                        className="btn btn-ghost text-xs text-ink-400 hover:text-rose-600"
                        onClick={() => handleDelete(g.id)}
                        disabled={busyId === g.id}
                      >
                        {t("common.delete")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        )}

        {editingId === "new" && (
          <GoalEditor
            initial={null}
            allGoals={goals}
            allItems={timelineItems}
            month={selectedMonth}
            order={goals.length}
            onCancel={() => setEditingId(null)}
            onSaved={() => {
              setEditingId(null);
              router.refresh();
            }}
            setErr={setErr}
          />
        )}

        {goals.length === 0 && editingId !== "new" && (
          <div className="text-sm text-ink-600 text-center py-6">
            {t("dashboard.monthly.empty")}
          </div>
        )}
      </div>

      {err && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2.5 py-2 mt-3">
          {err}
        </div>
      )}

      {canEdit && editingId !== "new" && goals.length < 5 && (
        <button
          className="btn btn-ghost mt-3 w-full border border-dashed border-ink-200 text-ink-600 hover:text-ink-900"
          onClick={() => setEditingId("new")}
        >
          {t("dashboard.monthly.add")}
        </button>
      )}
      {canEdit && goals.length >= 5 && (
        <p className="text-[11px] text-ink-400 text-center mt-3">
          已达上限——把本月的优先事项控制在 3–5 条。
        </p>
      )}

      <div className="mt-4 pt-3 border-t border-ink-100 flex items-center justify-between gap-2">
        <span className="text-[11px] text-ink-500">
          {timelineItems.length === 0
            ? "这个月暂时没有与时间线重叠的条目。"
            : `本月有 ${timelineItems.length} 条时间线条目` +
              (unlinkedTimelineCount > 0
                ? ` · 其中 ${unlinkedTimelineCount} 条未关联`
                : "")}
        </span>
        <Link
          href={timelineHref}
          className="text-[11px] text-brand-700 hover:text-brand-800 font-medium"
        >
          打开时间线 →
        </Link>
      </div>
    </div>
  );
}

// Combined "ordinal badge" + "achievement checkbox". When the goal is not
// achieved we show the position (1, 2, 3, ...). Hovering reveals a check
// icon that the user can click. When achieved, the badge becomes a green
// checkmark; clicking it again unmarks. Read-only viewers see the plain
// number / checkmark and no hover affordance.
function GoalCheckbox({
  goal,
  index,
  canMark,
  busy,
  onToggle,
}: {
  goal: MonthlyGoal;
  index: number;
  canMark: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const achieved = !!goal.achieved_at;

  if (!canMark) {
    return (
      <span
        className={[
          "shrink-0 mt-0.5 inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-semibold",
          achieved
            ? "bg-emerald-500 text-white"
            : "bg-brand-50 text-brand-700",
        ].join(" ")}
        aria-label={achieved ? "已达成" : `第 ${index + 1} 条`}
      >
        {achieved ? <Check /> : index + 1}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      className={[
        "group shrink-0 mt-0.5 inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-semibold border transition",
        achieved
          ? "bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-600"
          : "bg-brand-50 border-brand-50 text-brand-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-600",
        busy ? "opacity-60 cursor-wait" : "cursor-pointer",
      ].join(" ")}
      title={achieved ? "取消「已达成」" : "标记为已达成"}
      aria-label={achieved ? "取消「已达成」" : "标记为已达成"}
      aria-pressed={achieved}
    >
      {achieved ? (
        <Check />
      ) : (
        <>
          <span className="group-hover:hidden">{index + 1}</span>
          <span className="hidden group-hover:inline-flex">
            <Check />
          </span>
        </>
      )}
    </button>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none">
      <path
        d="M3 8l3.5 3.5L13 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TimelineRefs({
  items,
  timelineHref,
}: {
  items: TimelineItem[];
  timelineHref: string;
}) {
  if (items.length === 0) return null;
  return (
    <Link
      href={timelineHref}
      className="mt-1.5 flex flex-wrap items-center gap-1 group"
      title="在时间线上查看"
    >
      <span className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mr-0.5">
        时间线
      </span>
      {items.map((it) => {
        const t = trackById[it.track];
        return (
          <span
            key={it.id}
            className={`chip ${t.chip} group-hover:brightness-95`}
            title={`${t.label}：${it.title}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
            {it.title}
          </span>
        );
      })}
    </Link>
  );
}

function GoalEditor({
  initial,
  allGoals,
  allItems,
  month,
  order,
  onCancel,
  onSaved,
  setErr,
}: {
  initial: MonthlyGoal | null;
  allGoals: MonthlyGoal[];
  allItems: TimelineItem[];
  month?: string;
  order?: number;
  onCancel: () => void;
  onSaved: () => void;
  setErr: (e: string | null) => void;
}) {
  const t = useTranslations();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [track, setTrack] = useState<TimelineTrack | null>(
    initial?.track ?? null
  );
  const [thread, setThread] = useState(initial?.thread ?? "");
  const [busy, setBusy] = useState(false);

  const threadOptions = useMemo(
    () => (track ? threadSuggestions(allItems, allGoals, track) : []),
    [allItems, allGoals, track]
  );

  const save = async () => {
    setErr(null);
    setBusy(true);
    try {
      await saveMonthlyGoal({
        id: initial?.id,
        month: initial?.month ?? month!,
        title,
        description,
        order: initial?.order ?? order,
        track,
        thread: thread.trim() || null,
      });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-brand-200 rounded-lg p-3 bg-brand-50/40 space-y-2">
      <input
        className="input bg-white"
        value={title}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        placeholder="目标标题（写结果，而不是任务）"
      />
      <textarea
        className="input bg-white min-h-[50px]"
        value={description ?? ""}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="这个月为什么重要（可选）"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="label">{t("dashboard.monthly.track")}</label>
          <TrackSelect value={track} onChange={setTrack} />
        </div>
        <div>
          <label className="label">所属主线（可选）</label>
          <input
            className="input bg-white"
            value={thread}
            disabled={!track}
            list={track ? `goal-thread-suggestions-${track}` : undefined}
            onChange={(e) => setThread(e.target.value)}
            placeholder={track ? "例如：Parsons 暑校" : "请先选择一个方向"}
          />
          {track ? (
            <datalist id={`goal-thread-suggestions-${track}`}>
              {threadOptions.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          ) : null}
        </div>
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
          {busy ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </div>
  );
}

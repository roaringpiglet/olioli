"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addMonths,
  fmtDate,
  fmtMonth,
  parseISO,
  toISO,
} from "@/lib/dates";
import { can } from "@/lib/permissions";
import { STATUS_LABEL, TRACKS, trackById } from "@/lib/tracks";
import {
  deleteTimelineItem,
  saveTimelineItem,
  setTimelineItemStatus,
} from "@/app/actions/timeline";
import type {
  MonthlyGoal,
  Profile,
  TimelineItem,
  TimelineStatus,
  TimelineTrack,
} from "@/types/db";
import { threadSuggestions } from "@/lib/threads";
import { TimelineGrid } from "./TimelineGrid";

interface Props {
  profile: Profile;
  studentId: string;
  items: TimelineItem[];
  goals: MonthlyGoal[];
  fromISO: string;
  months: number;
  pastMonths: number;
  todayISO: string;
  todayMonthISO: string;
  defaultFromISO: string;
  defaultMonths: number;
}

// Presets are "months of forward visibility from today" — a fixed past
// buffer is loaded behind that so the user can always scroll back.
const RANGE_PRESETS: Array<{ futureMonths: number; label: string }> = [
  { futureMonths: 6, label: "6 个月" },
  { futureMonths: 12, label: "12 个月" },
  { futureMonths: 24, label: "24 个月" },
  { futureMonths: 36, label: "36 个月" },
];

type EditorState =
  | { mode: "edit"; item: TimelineItem }
  | { mode: "create"; track: TimelineTrack; defaultStart: string }
  | null;

export function TimelineClient({
  profile,
  items,
  goals,
  fromISO,
  months,
  pastMonths,
  todayISO,
  todayMonthISO,
  defaultFromISO,
  defaultMonths,
}: Props) {
  const canEdit = can.manageTimeline(profile.role);
  const router = useRouter();
  const [editor, setEditor] = useState<EditorState>(null);
  const [err, setErr] = useState<string | null>(null);

  const fromDate = parseISO(fromISO);
  const endDate = addMonths(fromDate, months);

  const monthsBetweenFromToday = Math.max(
    0,
    Math.round(
      (parseISO(todayMonthISO).getTime() - fromDate.getTime()) /
        (1000 * 60 * 60 * 24 * 30.4)
    )
  );
  const futureMonths = Math.max(1, months - monthsBetweenFromToday);

  const link = (overrides: { from?: string; months?: number } = {}) => {
    const params = new URLSearchParams();
    params.set("from", overrides.from ?? fromISO);
    params.set("months", String(overrides.months ?? months));
    return `/timeline?${params.toString()}`;
  };

  const prevHref = link({
    from: toISO(addMonths(fromDate, -Math.ceil(months / 2))),
  });
  const nextHref = link({
    from: toISO(addMonths(fromDate, Math.ceil(months / 2))),
  });
  const todayHref = `/timeline?from=${defaultFromISO}&months=${defaultMonths}`;
  const isAtToday = fromISO === defaultFromISO && months === defaultMonths;

  const goalsByMonth = useMemo(() => {
    const m = new Map<string, MonthlyGoal[]>();
    for (const g of goals) {
      const arr = m.get(g.month) ?? [];
      arr.push(g);
      m.set(g.month, arr);
    }
    return m;
  }, [goals]);

  const goalById = useMemo(() => {
    const m = new Map<string, MonthlyGoal>();
    for (const g of goals) m.set(g.id, g);
    return m;
  }, [goals]);

  const activeNow = items.filter(
    (i) => i.start_date <= todayISO && i.end_date >= todayISO
  );

  const upcoming = items.filter((i) => i.start_date > todayISO).slice(0, 5);

  return (
    <div className="space-y-5">
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
            时间线 · 未来 {futureMonths} 个月概览
          </div>
          <h2 className="text-base font-semibold text-ink-900 mt-0.5">
            {fmtMonth(fromISO)} – {fmtMonth(toISO(addMonths(endDate, -1)))}
          </h2>
          <p className="text-xs text-ink-600 mt-0.5">
            以今天为基准——可以向左滚动回顾过去
            {pastMonths > 0 ? `（已加载 ${pastMonths} 个月）` : ""}。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-ink-200 bg-white p-0.5">
            {RANGE_PRESETS.map((p) => {
              const totalMonths = pastMonths + p.futureMonths;
              return (
                <Link
                  key={p.futureMonths}
                  href={`/timeline?from=${defaultFromISO}&months=${totalMonths}`}
                  className={
                    "px-2.5 py-1 text-xs rounded " +
                    (totalMonths === months && fromISO === defaultFromISO
                      ? "bg-brand-100 text-brand-700 font-semibold"
                      : "text-ink-600 hover:text-ink-900")
                  }
                >
                  {p.label}
                </Link>
              );
            })}
          </div>
          <Link href={prevHref} className="btn">
            ← 更早
          </Link>
          <Link
            href={todayHref}
            className={
              "btn " + (isAtToday ? "opacity-50 pointer-events-none" : "")
            }
            aria-disabled={isAtToday}
          >
            回到今天
          </Link>
          <Link href={nextHref} className="btn">
            更晚 →
          </Link>
          {canEdit ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                setEditor({
                  mode: "create",
                  track: "academic",
                  defaultStart: todayISO,
                })
              }
            >
              + 新增条目
            </button>
          ) : null}
        </div>
      </div>

      {err && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
          {err}
        </div>
      )}

      <TimelineGrid
        items={items}
        goals={goals}
        fromISO={fromISO}
        months={months}
        todayISO={todayISO}
        anchorISO={todayMonthISO}
        canEdit={canEdit}
        onOpenItem={(it) => setEditor({ mode: "edit", item: it })}
        onAddInTrack={(track) =>
          setEditor({ mode: "create", track, defaultStart: todayISO })
        }
      />

      <div className="grid md:grid-cols-2 gap-4">
        <ItemList
          title="正在进行"
          empty="当前窗口内没有进行中的条目。"
          items={activeNow}
          goalById={goalById}
          onOpen={(it) => setEditor({ mode: "edit", item: it })}
        />
        <ItemList
          title="即将到来"
          empty="当前窗口内没有即将到来的条目。"
          items={upcoming}
          goalById={goalById}
          onOpen={(it) => setEditor({ mode: "edit", item: it })}
        />
      </div>

      {editor ? (
        <ItemEditor
          state={editor}
          goalsByMonth={goalsByMonth}
          allGoals={goals}
          allItems={items}
          fromISO={fromISO}
          monthsInView={months}
          canEdit={canEdit}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            router.refresh();
          }}
          setErr={setErr}
        />
      ) : null}
    </div>
  );
}

function ItemList({
  title,
  empty,
  items,
  goalById,
  onOpen,
}: {
  title: string;
  empty: string;
  items: TimelineItem[];
  goalById: Map<string, MonthlyGoal>;
  onOpen: (it: TimelineItem) => void;
}) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
        {title}
      </div>
      <div className="mt-2 space-y-1.5">
        {items.length === 0 ? (
          <div className="text-sm text-ink-500 italic py-2">{empty}</div>
        ) : (
          items.map((it) => {
            const t = trackById[it.track];
            const goal = it.monthly_goal_id
              ? goalById.get(it.monthly_goal_id)
              : null;
            return (
              <button
                key={it.id}
                onClick={() => onOpen(it)}
                className="w-full text-left flex items-center gap-2 rounded-md hover:bg-ink-50 px-2 py-1.5 transition"
              >
                <span className={`chip ${t.chip} shrink-0`}>{t.label}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-ink-900 truncate">
                    {it.title}
                  </span>
                  <span className="block text-[11px] text-ink-500">
                    {it.start_date === it.end_date
                      ? `截止 · ${fmtDate(it.start_date)}`
                      : `${fmtDate(it.start_date)} – ${fmtDate(it.end_date)}`}
                    {goal ? ` · ↳ ${goal.title}` : ""}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function ItemEditor({
  state,
  goalsByMonth,
  allGoals,
  allItems,
  fromISO,
  monthsInView,
  canEdit,
  onClose,
  onSaved,
  setErr,
}: {
  state: NonNullable<EditorState>;
  goalsByMonth: Map<string, MonthlyGoal[]>;
  allGoals: MonthlyGoal[];
  allItems: TimelineItem[];
  fromISO: string;
  monthsInView: number;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
  setErr: (e: string | null) => void;
}) {
  const isEdit = state.mode === "edit";
  const initial = isEdit ? state.item : null;
  const defaultStart = isEdit ? initial!.start_date : state.defaultStart;
  const defaultEnd = isEdit ? initial!.end_date : defaultStart;

  const [track, setTrack] = useState<TimelineTrack>(
    isEdit ? initial!.track : state.track
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [kind, setKind] = useState<"period" | "deadline">(
    defaultStart === defaultEnd ? "deadline" : "period"
  );
  const [status, setStatus] = useState<TimelineStatus>(
    initial?.status ?? "planned"
  );
  const [monthlyGoalId, setMonthlyGoalId] = useState<string | "">(
    initial?.monthly_goal_id ?? ""
  );
  const [thread, setThread] = useState(initial?.thread ?? "");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const goalsForStartMonth = useMemo(() => {
    const m = startDate.slice(0, 8) + "01";
    return goalsByMonth.get(m) ?? [];
  }, [goalsByMonth, startDate]);

  const goalOptions =
    goalsForStartMonth.length > 0 ? goalsForStartMonth : allGoals;

  const threadOptions = useMemo(
    () => threadSuggestions(allItems, allGoals, track),
    [allItems, allGoals, track]
  );

  const save = async () => {
    setErr(null);
    setBusy(true);
    try {
      await saveTimelineItem({
        id: initial?.id,
        track,
        title,
        description,
        startDate,
        endDate: kind === "deadline" ? startDate : endDate,
        status,
        monthlyGoalId: monthlyGoalId || null,
        thread: thread.trim() || null,
      });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!initial) return;
    if (!confirm("确认删除这条时间线条目？")) return;
    setErr(null);
    setBusy(true);
    startTransition(async () => {
      try {
        await deleteTimelineItem(initial.id);
        onSaved();
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
    });
  };

  const quickStatus = async (s: TimelineStatus) => {
    if (!initial) return;
    setStatus(s);
    setErr(null);
    setBusy(true);
    startTransition(async () => {
      try {
        await setTimelineItemStatus(initial.id, s);
        onSaved();
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-40 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-ink-200 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-ink-200 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
              {isEdit ? "编辑时间线条目" : "新增时间线条目"}
            </div>
            <div className="text-sm font-semibold text-ink-900 mt-0.5">
              {trackById[track].label}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost text-ink-500"
            onClick={onClose}
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="label">方向</label>
            <select
              className="input"
              value={track}
              onChange={(e) => setTrack(e.target.value as TimelineTrack)}
              disabled={!canEdit}
            >
              {TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">标题</label>
            <input
              className="input"
              value={title}
              autoFocus
              disabled={!canEdit}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：SAT 备考课程 / AP 生物期末"
            />
          </div>

          <div>
            <label className="label">
              所属主线（可选）
              <span className="ml-1 text-ink-400 font-normal normal-case tracking-normal">
                — 这件事属于哪条长期线索
              </span>
            </label>
            <input
              className="input"
              value={thread}
              disabled={!canEdit}
              list={`thread-suggestions-${track}`}
              onChange={(e) => setThread(e.target.value)}
              placeholder="例如：Parsons 暑校、旧物改造社"
            />
            <datalist id={`thread-suggestions-${track}`}>
              {threadOptions.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <p className="text-[11px] text-ink-500 mt-1">
              同一条主线上的条目会在时间线上形成一根细线，让你看到这条线索在几个月里的走向。
            </p>
          </div>

          <div>
            <label className="label">描述（可选）</label>
            <textarea
              className="input min-h-[70px]"
              value={description ?? ""}
              disabled={!canEdit}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="这件事在整盘计划里的位置与意义。"
            />
          </div>

          <div>
            <label className="label">类型</label>
            <div className="inline-flex rounded-md border border-ink-200 bg-white p-0.5">
              {(
                [
                  { v: "period", label: "时间段" },
                  { v: "deadline", label: "截止日期" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  className={
                    "px-2.5 py-1 text-xs rounded " +
                    (opt.v === kind
                      ? "bg-brand-100 text-brand-700 font-semibold"
                      : "text-ink-600 hover:text-ink-900")
                  }
                  disabled={!canEdit}
                  onClick={() => {
                    setKind(opt.v);
                    if (opt.v === "deadline") setEndDate(startDate);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink-500 mt-1">
              {kind === "deadline"
                ? "单日节点——在时间线上以一个图钉呈现。"
                : "一段时间——在时间线上以一条从起点到终点的线段呈现。"}
            </p>
          </div>

          {kind === "deadline" ? (
            <div>
              <label className="label">日期</label>
              <input
                type="date"
                className="input"
                value={startDate}
                disabled={!canEdit}
                onChange={(e) => {
                  const v = e.target.value;
                  setStartDate(v);
                  setEndDate(v);
                }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">开始日期</label>
                <input
                  type="date"
                  className="input"
                  value={startDate}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const v = e.target.value;
                    setStartDate(v);
                    if (endDate < v) setEndDate(v);
                  }}
                />
              </div>
              <div>
                <label className="label">结束日期</label>
                <input
                  type="date"
                  className="input"
                  value={endDate}
                  disabled={!canEdit}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          )}

          <div>
            <label className="label">状态</label>
            <div className="inline-flex rounded-md border border-ink-200 bg-white p-0.5">
              {(Object.keys(STATUS_LABEL) as TimelineStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={
                    "px-2.5 py-1 text-xs rounded " +
                    (s === status
                      ? "bg-brand-100 text-brand-700 font-semibold"
                      : "text-ink-600 hover:text-ink-900")
                  }
                  disabled={!canEdit}
                  onClick={() => (isEdit ? quickStatus(s) : setStatus(s))}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">关联的本月目标（可选）</label>
            <select
              className="input"
              value={monthlyGoalId}
              disabled={!canEdit}
              onChange={(e) => setMonthlyGoalId(e.target.value)}
            >
              <option value="">— 无 —</option>
              {goalOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {fmtMonth(g.month)} · {g.title}
                </option>
              ))}
            </select>
            {goalOptions.length === 0 ? (
              <p className="text-[11px] text-ink-500 mt-1">
                从 {fmtMonth(fromISO)} 起的 {monthsInView} 个月窗口内，还没有设置过本月目标。
              </p>
            ) : null}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-ink-200 flex items-center justify-between gap-2">
          <div>
            {isEdit && canEdit ? (
              <button
                type="button"
                className="btn text-rose-600 hover:bg-rose-50"
                onClick={remove}
                disabled={busy}
              >
                删除
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn"
              onClick={onClose}
              disabled={busy}
            >
              {canEdit ? "取消" : "关闭"}
            </button>
            {canEdit ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={save}
                disabled={busy || !title.trim()}
              >
                {busy ? "保存中……" : isEdit ? "保存修改" : "创建条目"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  GrowthReminder,
  GrowthReminderState,
  IdeaBoard,
  ReminderUrgency,
} from "@/types/db";

interface Props {
  state: GrowthReminderState | null;
  boards: IdeaBoard[];
  canRefresh: boolean;
  setErr: (e: string | null) => void;
  onJumpToBoard: (boardId: string) => void;
}

export function RemindersSection({
  state,
  boards,
  canRefresh,
  setErr,
  onJumpToBoard,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fresh, setFresh] = useState<GrowthReminderState | null>(null);

  const data = fresh ?? state;
  const hasContent = boards.some((b) => (b.content ?? "").trim().length > 0);
  const staleNote = useStalenessNote(data, boards);

  const boardsById = useMemo(() => {
    const m = new Map<string, IdeaBoard>();
    for (const b of boards) m.set(b.id, b);
    return m;
  }, [boards]);

  const refresh = () => {
    setErr(null);
    start(async () => {
      try {
        const res = await fetch("/api/ai/growth-reminders", {
          method: "POST",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "刷新失败，请稍后再试。");
        setFresh({
          student_id: state?.student_id ?? "",
          reminders: json.reminders ?? [],
          generated_at: json.generated_at ?? new Date().toISOString(),
          generated_by: state?.generated_by ?? null,
        });
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">提醒</h2>
          <p className="text-xs text-ink-500 max-w-2xl">
            AI 会读取你的「想法与选项」白板，提取其中的截止日期与近期需要确认的事项。添加新笔记后记得刷新。
          </p>
        </div>
        {canRefresh ? (
          <button
            className="btn"
            onClick={refresh}
            disabled={pending || !hasContent}
            title={
              !hasContent
                ? "先在想法白板里写点东西"
                : "重新阅读所有白板并提取提醒"
            }
          >
            {pending
              ? "思考中……"
              : data?.reminders.length
                ? "刷新"
                : "扫描白板"}
          </button>
        ) : null}
      </div>

      {!hasContent ? (
        <div className="card p-3 text-sm text-ink-500 italic">
          还没有内容可以扫描——先打开上方某块白板写点笔记，比如截止日期、链接或选择，再点「扫描白板」。
        </div>
      ) : !data || data.reminders.length === 0 ? (
        <div className="card p-3 text-sm text-ink-500 italic">
          {data
            ? "暂时没有识别到具体的提醒。可以给白板加上日期、截止时间或决定相关的描述，然后再刷新。"
            : canRefresh
              ? "还没有提醒——点击「扫描白板」，从笔记里抓取截止日期。"
              : "还没有提醒。"}
          {data ? (
            <div className="text-[11px] text-ink-400 mt-2">
              上次扫描 · {fmtTimeAgo(data.generated_at)}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <ul className="grid gap-2 md:grid-cols-2">
            {data.reminders.map((r) => (
              <ReminderCard
                key={r.id}
                reminder={r}
                board={
                  r.source_board_id
                    ? (boardsById.get(r.source_board_id) ?? null)
                    : null
                }
                onJumpToBoard={onJumpToBoard}
              />
            ))}
          </ul>
          <div className="text-[11px] text-ink-400">
            上次扫描 · {fmtTimeAgo(data.generated_at)}
            {staleNote ? ` · ${staleNote}` : ""}
          </div>
        </>
      )}
    </section>
  );
}

function useStalenessNote(
  state: GrowthReminderState | null,
  boards: IdeaBoard[]
): string | null {
  if (!state) return null;
  const generated = new Date(state.generated_at).getTime();
  const newestBoardUpdate = boards.reduce<number>((acc, b) => {
    const t = new Date(b.updated_at).getTime();
    return Number.isFinite(t) && t > acc ? t : acc;
  }, 0);
  if (newestBoardUpdate > generated + 1000) {
    return "白板已更新——刷新以获取最新提醒";
  }
  return null;
}

const URGENCY_STYLE: Record<ReminderUrgency, string> = {
  soon: "bg-rose-100 text-rose-800 border-rose-200",
  upcoming: "bg-amber-100 text-amber-800 border-amber-200",
  later: "bg-ink-100 text-ink-700 border-ink-200",
};
const URGENCY_LABEL: Record<ReminderUrgency, string> = {
  soon: "即将",
  upcoming: "近期",
  later: "稍远",
};

function ReminderCard({
  reminder,
  board,
  onJumpToBoard,
}: {
  reminder: GrowthReminder;
  board: IdeaBoard | null;
  onJumpToBoard: (id: string) => void;
}) {
  const dateLabel = reminder.date ? fmtReminderDate(reminder.date) : null;
  const daysAway = reminder.date ? daysFromToday(reminder.date) : null;
  const displayUrgency: ReminderUrgency =
    daysAway != null && daysAway <= 14
      ? "soon"
      : daysAway != null && daysAway <= 60
        ? "upcoming"
        : reminder.urgency;

  return (
    <li className="card p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink-900 break-words">
            {reminder.title}
          </div>
          {dateLabel ? (
            <div className="text-xs text-ink-600 mt-0.5">
              {dateLabel}
              {daysAway != null ? (
                <span className="text-ink-400">
                  {" "}
                  · {daysAwayLabel(daysAway)}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <span
          className={
            "shrink-0 inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded border " +
            URGENCY_STYLE[displayUrgency]
          }
        >
          {URGENCY_LABEL[displayUrgency]}
        </span>
      </div>
      {reminder.detail ? (
        <p className="text-sm text-ink-700">{reminder.detail}</p>
      ) : null}
      {board ? (
        <button
          className="btn btn-ghost text-xs self-start"
          onClick={() => onJumpToBoard(board.id)}
          title="跳转到这条提醒来源的白板"
        >
          打开「{board.title}」→
        </button>
      ) : null}
    </li>
  );
}

function fmtReminderDate(iso: string): string {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      weekday: "short",
    });
  } catch {
    return iso;
  }
}

function daysFromToday(iso: string): number | null {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    const target = new Date(y, (m || 1) - 1, d || 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86400000);
  } catch {
    return null;
  }
}

function daysAwayLabel(n: number): string {
  if (n === 0) return "就在今天";
  if (n === 1) return "明天";
  if (n === -1) return "昨天";
  if (n < 0) return `${Math.abs(n)} 天前`;
  return `${n} 天后`;
}

function fmtTimeAgo(iso: string): string {
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
    return new Date(iso).toLocaleDateString("zh-CN");
  } catch {
    return iso;
  }
}

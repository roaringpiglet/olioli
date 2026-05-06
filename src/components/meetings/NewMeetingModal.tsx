"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { saveMeeting } from "@/app/actions/meetings";
import { linkTopicsToMeeting } from "@/app/actions/topics";
import type { AgendaItem, Meeting, MeetingTopic } from "@/types/db";

interface Props {
  openTopics: MeetingTopic[];
  onClose: () => void;
  onCreated: (meeting: Meeting) => void;
  setErr: (e: string | null) => void;
}

type Mode = "schedule" | "log_past";

export function NewMeetingModal({
  openTopics,
  onClose,
  onCreated,
  setErr,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("schedule");
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState<string>(defaultFuture());
  const [duration, setDuration] = useState(30);
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const switchMode = (next: Mode) => {
    setMode(next);
    setScheduledAt(next === "log_past" ? defaultPast() : defaultFuture());
  };

  const isPast = mode === "log_past";

  const pickedTotal = useMemo(() => {
    let sum = 0;
    for (const t of openTopics) {
      if (selectedTopics.has(t.id) && t.duration_minutes) {
        sum += t.duration_minutes;
      }
    }
    return sum;
  }, [selectedTopics, openTopics]);

  const toggleTopic = (id: string) => {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const buildAgendaFromTopics = (): AgendaItem[] => {
    const picked = openTopics.filter((t) => selectedTopics.has(t.id));
    return picked.map((t) => {
      const suffix = t.duration_minutes ? `（约 ${t.duration_minutes} 分钟）` : "";
      const body = t.notes
        ? `${t.title}${suffix}\n${t.notes}`
        : `${t.title}${suffix}`;
      return {
        id: crypto.randomUUID(),
        text: body,
        done: false,
      };
    });
  };

  const submit = () => {
    if (!title.trim()) {
      setErr("请填写标题。");
      return;
    }
    if (!scheduledAt) {
      setErr("请选择日期与时间。");
      return;
    }
    setErr(null);
    start(async () => {
      try {
        const iso = new Date(scheduledAt).toISOString();
        const agenda = buildAgendaFromTopics();
        const saved = await saveMeeting({
          title: title.trim(),
          scheduled_at: iso,
          duration_minutes: duration,
          meeting_link: link.trim() || null,
          agenda,
          status: isPast ? "completed" : "scheduled",
          notes: isPast ? notes : undefined,
        });
        if (selectedTopics.size > 0) {
          await linkTopicsToMeeting(saved.id, Array.from(selectedTopics));
        }
        router.refresh();
        onCreated(saved);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  return (
    <Modal
      title={isPast ? "记录过往会谈" : "安排新会谈"}
      onClose={onClose}
      width="md"
    >
      <ModeTabs mode={mode} onChange={switchMode} />

      <label className="label">标题</label>
      <input
        className="input mb-3"
        placeholder={
          isPast
            ? "例如：第一次对谈、作品集评审等"
            : "例如：文书策略同步"
        }
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="label">
            {isPast ? "发生的时间" : "时间"}
          </label>
          <input
            type="datetime-local"
            className="input"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </div>
        <div>
          <label className="label">时长（分钟）</label>
          <input
            type="number"
            min={5}
            max={240}
            step={5}
            className="input"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value) || 30)}
          />
        </div>
      </div>

      <label className="label">会议链接（可选）</label>
      <input
        className="input mb-4"
        placeholder="https://zoom.us/j/… 或 腾讯会议链接"
        value={link}
        onChange={(e) => setLink(e.target.value)}
      />

      {!isPast && openTopics.length > 0 ? (
        <div className="mb-4">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <label className="label !mb-0">从待讨论话题里选几条加入议程</label>
            <span className="text-xs text-ink-500">
              已选 {selectedTopics.size} 条
              {pickedTotal > 0 ? ` · 合计约 ${pickedTotal} 分钟` : ""}
            </span>
          </div>
          <ul className="max-h-48 overflow-y-auto space-y-1 border border-ink-200 rounded-md p-1.5 bg-ink-50/40">
            {openTopics.map((t) => {
              const picked = selectedTopics.has(t.id);
              return (
                <li key={t.id}>
                  <label
                    className={
                      "flex items-start gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm " +
                      (picked ? "bg-brand-50" : "hover:bg-white")
                    }
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-brand-500"
                      checked={picked}
                      onChange={() => toggleTopic(t.id)}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="font-medium text-ink-900">
                        {t.title}
                      </span>
                      {t.duration_minutes ? (
                        <span className="text-ink-500 text-xs ml-1">
                          （约 {t.duration_minutes} 分钟）
                        </span>
                      ) : null}
                      {t.notes ? (
                        <span className="block text-xs text-ink-500 line-clamp-2">
                          {t.notes}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-ink-500 mt-1">
            被选中的话题会进入议程初稿。创建会谈后仍可继续编辑，或让 AI 补充更多。
          </p>
        </div>
      ) : null}

      {isPast ? (
        <>
          <label className="label">会谈笔记</label>
          <textarea
            className="input mb-1"
            rows={6}
            placeholder="把讨论内容贴进来或简单概括即可——AI 之后可以帮你提炼结构。"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <p className="text-xs text-ink-500 mb-4">
            现在写下笔记，这次会谈就能立刻纳入学生的历史记录，后续的议程与摘要才有连续性。
          </p>
        </>
      ) : null}

      <div className="flex justify-end gap-2">
        <button className="btn" onClick={onClose} disabled={pending}>
          取消
        </button>
        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={pending || !title.trim()}
        >
          {pending ? "保存中……" : isPast ? "记录会谈" : "创建会谈"}
        </button>
      </div>
      {!isPast ? (
        <p className="text-xs text-ink-500 mt-3">
          创建后可以打开会谈继续编辑议程（也可以让 AI 再补几条）。
        </p>
      ) : (
        <p className="text-xs text-ink-500 mt-3">
          记录后会直接打开这次会谈，方便你对笔记运行「让 AI 提炼」。
        </p>
      )}
    </Modal>
  );
}

function ModeTabs({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  const opts: Array<{ id: Mode; label: string; blurb: string }> = [
    {
      id: "schedule",
      label: "安排未来会谈",
      blurb: "即将召开的会谈，含议程与链接。",
    },
    {
      id: "log_past",
      label: "记录过往会谈",
      blurb: "补录一次已经发生过的会谈，含笔记。",
    },
  ];
  return (
    <div className="mb-4 flex gap-1 p-1 rounded-lg bg-ink-100 border border-ink-200 text-xs">
      {opts.map((o) => {
        const active = o.id === mode;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={
              "flex-1 px-3 py-2 rounded-md transition text-left " +
              (active
                ? "bg-white shadow-sm border border-ink-200"
                : "text-ink-600 hover:text-ink-900")
            }
          >
            <div className={`font-medium ${active ? "text-ink-900" : ""}`}>
              {o.label}
            </div>
            <div className="text-[11px] text-ink-500">{o.blurb}</div>
          </button>
        );
      })}
    </div>
  );
}

function defaultFuture(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toInput(d);
}

function defaultPast(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(15, 0, 0, 0);
  return toInput(d);
}

function toInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

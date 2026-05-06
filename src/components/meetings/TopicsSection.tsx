"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Meeting, MeetingTopic, Profile } from "@/types/db";
import { roleLabel } from "@/lib/permissions";
import {
  deleteTopic,
  markTopicCompleted,
  reopenTopic,
  saveTopic,
} from "@/app/actions/topics";

interface Props {
  profile: Profile;
  topics: MeetingTopic[];
  meetings: Meeting[];
  creators: Record<string, { name: string; role: string }>;
  setErr: (e: string | null) => void;
}

// Shared backlog — sits between Upcoming and Past. Anyone linked to the
// student (counselor, parent, student) can add/edit/delete.
export function TopicsSection({
  profile,
  topics,
  meetings,
  creators,
  setErr,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const { open, scheduled, completed } = useMemo(() => {
    const open: MeetingTopic[] = [];
    const scheduled: MeetingTopic[] = [];
    const completed: MeetingTopic[] = [];
    for (const t of topics) {
      if (t.status === "open") open.push(t);
      else if (t.status === "scheduled") scheduled.push(t);
      else completed.push(t);
    }
    return { open, scheduled, completed };
  }, [topics]);

  const meetingById = useMemo(() => {
    const m = new Map<string, Meeting>();
    for (const mt of meetings) m.set(mt.id, mt);
    return m;
  }, [meetings]);

  return (
    <section>
      <div className="mb-2 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">
            待讨论话题
          </h2>
          <p className="text-xs text-ink-500 max-w-xl">
            大家共享的清单，随时可以加入。安排新会谈时可以从这里挑话题，详情会自动进入议程初稿。
          </p>
        </div>
        <button
          onClick={() => {
            setAdding(true);
            setEditingId(null);
          }}
          className="btn"
        >
          + 新增话题
        </button>
      </div>

      {adding ? (
        <TopicEditor
          onCancel={() => setAdding(false)}
          onSaved={() => setAdding(false)}
          setErr={setErr}
        />
      ) : null}

      {open.length === 0 && scheduled.length === 0 && !adding ? (
        <div className="card p-4 text-sm text-ink-500 italic">
          暂时没有需要讨论的话题。想到什么就记下来，下一次会谈时一并过一遍。
        </div>
      ) : null}

      {open.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2 mt-3">
          {open.map((t) =>
            editingId === t.id ? (
              <li key={t.id} className="sm:col-span-2">
                <TopicEditor
                  initial={t}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => setEditingId(null)}
                  setErr={setErr}
                />
              </li>
            ) : (
              <li key={t.id}>
                <TopicCard
                  topic={t}
                  creator={t.created_by ? creators[t.created_by] : undefined}
                  viewerRole={profile.role}
                  onEdit={() => {
                    setEditingId(t.id);
                    setAdding(false);
                  }}
                  setErr={setErr}
                />
              </li>
            )
          )}
        </ul>
      ) : null}

      {scheduled.length > 0 ? (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold mb-1">
            已进入即将召开的会谈
          </div>
          <ul className="space-y-1.5">
            {scheduled.map((t) => {
              const linked = t.scheduled_meeting_id
                ? meetingById.get(t.scheduled_meeting_id)
                : null;
              return (
                <li
                  key={t.id}
                  className="card p-2.5 text-sm flex items-center justify-between gap-2 bg-brand-50/40 border-brand-100"
                >
                  <span className="truncate">
                    <span className="text-ink-800">{t.title}</span>
                    {t.duration_minutes ? (
                      <span className="text-ink-500 text-xs ml-1">
                        （约 {t.duration_minutes} 分钟）
                      </span>
                    ) : null}
                    {linked ? (
                      <span className="text-ink-500 text-xs ml-2">
                        → {linked.title}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-brand-700">已安排</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {completed.length > 0 ? (
        <div className="mt-4">
          <button
            className="text-xs text-ink-500 hover:text-ink-800"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "收起" : "展开"}已讨论的 {completed.length} 条
          </button>
          {showArchived ? (
            <ul className="mt-2 space-y-1.5">
              {completed.map((t) => (
                <CompletedTopicRow key={t.id} topic={t} setErr={setErr} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function TopicCard({
  topic,
  creator,
  viewerRole: _viewerRole,
  onEdit,
  setErr,
}: {
  topic: MeetingTopic;
  creator?: { name: string; role: string };
  viewerRole: Profile["role"];
  onEdit: () => void;
  setErr: (e: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const complete = () => {
    setErr(null);
    start(async () => {
      try {
        await markTopicCompleted(topic.id);
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  const remove = () => {
    if (!confirm("确认删除这个话题？")) return;
    setErr(null);
    start(async () => {
      try {
        await deleteTopic(topic.id);
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  return (
    <div className="card p-3 text-sm flex flex-col h-full">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink-900 break-words">
            {topic.title}
          </div>
          {topic.duration_minutes ? (
            <div className="text-xs text-ink-500 mt-0.5">
              约 {topic.duration_minutes} 分钟
            </div>
          ) : null}
        </div>
      </div>
      {topic.notes ? (
        <div className="text-sm text-ink-700 mt-2 whitespace-pre-wrap">
          {topic.notes}
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-ink-400 pt-2 border-t border-ink-100">
        <div className="truncate">
          {creator
            ? `由 ${creator.name}${
                creator.role && creator.role !== "student"
                  ? `（${roleLabel[creator.role as Profile["role"]] ?? creator.role}）`
                  : ""
              } 添加`
            : "已添加"}
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            className="btn btn-ghost text-xs py-1 px-2"
            disabled={pending}
            onClick={onEdit}
          >
            编辑
          </button>
          <button
            className="btn btn-ghost text-xs py-1 px-2"
            disabled={pending}
            onClick={complete}
            title="标记为已讨论 / 不再需要"
          >
            ✓ 已讨论
          </button>
          <button
            className="btn btn-ghost text-xs py-1 px-2 text-rose-600"
            disabled={pending}
            onClick={remove}
            aria-label="删除话题"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function CompletedTopicRow({
  topic,
  setErr,
}: {
  topic: MeetingTopic;
  setErr: (e: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const reopen = () => {
    setErr(null);
    start(async () => {
      try {
        await reopenTopic(topic.id);
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  const remove = () => {
    if (!confirm("确认永久删除这个话题？")) return;
    setErr(null);
    start(async () => {
      try {
        await deleteTopic(topic.id);
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  return (
    <li className="text-sm flex items-center justify-between gap-2 py-1 px-2 rounded hover:bg-ink-50">
      <span className="line-through text-ink-500 truncate">
        {topic.title}
        {topic.duration_minutes ? `（约 ${topic.duration_minutes} 分钟）` : ""}
      </span>
      <span className="flex gap-1 shrink-0">
        <button
          className="btn btn-ghost text-xs py-0.5 px-1.5"
          disabled={pending}
          onClick={reopen}
        >
          重新打开
        </button>
        <button
          className="btn btn-ghost text-xs py-0.5 px-1.5 text-rose-600"
          disabled={pending}
          onClick={remove}
        >
          ✕
        </button>
      </span>
    </li>
  );
}

function TopicEditor({
  initial,
  onCancel,
  onSaved,
  setErr,
}: {
  initial?: MeetingTopic;
  onCancel: () => void;
  onSaved: () => void;
  setErr: (e: string | null) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [duration, setDuration] = useState<number | "">(
    initial?.duration_minutes ?? 30
  );
  const [pending, start] = useTransition();

  const submit = () => {
    if (!title.trim()) {
      setErr("请给话题起个名字。");
      return;
    }
    setErr(null);
    start(async () => {
      try {
        await saveTopic({
          id: initial?.id,
          title: title.trim(),
          notes: notes.trim() || null,
          duration_minutes:
            typeof duration === "number" && duration > 0 ? duration : null,
        });
        router.refresh();
        onSaved();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  return (
    <div className="card p-3 space-y-2 border-brand-200 bg-brand-50/30">
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="话题——例如：一起提交 Parsons 住宿申请"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <input
          type="number"
          min={5}
          max={240}
          step={5}
          className="input w-24"
          placeholder="分钟"
          value={duration}
          onChange={(e) =>
            setDuration(e.target.value === "" ? "" : Number(e.target.value))
          }
        />
      </div>
      <textarea
        className="input"
        rows={2}
        placeholder="可选备注：需要提前准备什么、希望拍板什么、文档链接……"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <button className="btn" onClick={onCancel} disabled={pending}>
          取消
        </button>
        <button
          className="btn btn-primary"
          disabled={pending || !title.trim()}
          onClick={submit}
        >
          {pending ? "保存中……" : initial ? "保存" : "新增话题"}
        </button>
      </div>
    </div>
  );
}

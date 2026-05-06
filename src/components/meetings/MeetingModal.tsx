"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import type {
  AgendaItem,
  Meeting,
  MeetingAIExtract,
  MeetingReflection,
  MeetingSuggestion,
  Profile,
} from "@/types/db";
import { can } from "@/lib/permissions";
import { fmtMeetingDateTime, toLocalDatetimeInputValue } from "@/lib/dates";
import {
  approveMeetingRequest,
  cancelMeeting,
  decideMeetingSuggestion,
  deleteMeeting,
  rejectMeetingRequest,
  saveMeeting,
  saveMeetingNotes,
  setMeetingAIExtract,
} from "@/app/actions/meetings";
import { addReflection } from "@/app/actions/reflections";

interface Props {
  profile: Profile;
  meeting: Meeting;
  reflections: MeetingReflection[]; // only non-empty when profile is the student
  onClose: () => void;
  setErr: (e: string | null) => void;
}

export function MeetingModal({
  profile,
  meeting,
  reflections,
  onClose,
  setErr,
}: Props) {
  const canManage = can.manageMeetings(profile.role);
  const isStudent = profile.role === "student";
  const isRequested = meeting.status === "requested";
  const isPast =
    meeting.status === "completed" ||
    (meeting.scheduled_at
      ? new Date(meeting.scheduled_at).getTime() < Date.now()
      : false);

  const title =
    isRequested && canManage
      ? "处理会谈申请"
      : isRequested
        ? "你的会谈申请"
        : "会谈";

  return (
    <Modal title={title} onClose={onClose} width="xl">
      {isRequested && canManage ? (
        <ApproveRequestView meeting={meeting} onDone={onClose} setErr={setErr} />
      ) : isRequested ? (
        <RequestedView meeting={meeting} />
      ) : (
        <ScheduledOrPastView
          profile={profile}
          meeting={meeting}
          reflections={reflections}
          canManage={canManage}
          isStudent={isStudent}
          isPast={isPast}
          onClose={onClose}
          setErr={setErr}
        />
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------
// Student's view of their own pending request
// ------------------------------------------------------------------
function RequestedView({ meeting }: { meeting: Meeting }) {
  return (
    <div className="space-y-4">
      <div className="card p-3 bg-amber-50 border-amber-200 text-sm text-amber-900">
        正在等待顾问确认时间。
      </div>
      <Field label="主题">
        <div className="text-sm text-ink-800 whitespace-pre-wrap">
          {meeting.request_topic ?? meeting.title}
        </div>
      </Field>
    </div>
  );
}

// ------------------------------------------------------------------
// Counselor approving/rejecting a request
// ------------------------------------------------------------------
function ApproveRequestView({
  meeting,
  onDone,
  setErr,
}: {
  meeting: Meeting;
  onDone: () => void;
  setErr: (e: string | null) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(meeting.title);
  const [when, setWhen] = useState(defaultDatetime());
  const [duration, setDuration] = useState(meeting.duration_minutes ?? 30);
  const [link, setLink] = useState(meeting.meeting_link ?? "");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const approve = () => {
    if (!when) {
      setErr("请选择时间。");
      return;
    }
    setErr(null);
    start(async () => {
      try {
        // Update the title if the counselor tweaked it.
        if (title.trim() && title.trim() !== meeting.title) {
          await saveMeeting({
            id: meeting.id,
            title: title.trim(),
            scheduled_at: meeting.scheduled_at,
            duration_minutes: meeting.duration_minutes,
            meeting_link: meeting.meeting_link,
            agenda: meeting.agenda ?? [],
          });
        }
        await approveMeetingRequest({
          id: meeting.id,
          scheduled_at: new Date(when).toISOString(),
          duration_minutes: duration,
          meeting_link: link.trim() || null,
          agenda: meeting.agenda ?? [],
        });
        router.refresh();
        onDone();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  const reject = () => {
    setErr(null);
    start(async () => {
      try {
        await rejectMeetingRequest(meeting.id, reason || null);
        router.refresh();
        onDone();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  return (
    <div className="space-y-4">
      <Field label="学生的申请主题">
        <div className="card p-3 text-sm whitespace-pre-wrap bg-amber-50 border-amber-200">
          {meeting.request_topic ?? meeting.title}
        </div>
      </Field>

      <div className="border-t border-ink-200 pt-4">
        <h3 className="text-sm font-semibold text-ink-900 mb-2">确认时间并安排</h3>
        <Field label="会谈标题">
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="时间">
            <input
              type="datetime-local"
              className="input"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </Field>
          <Field label="时长（分钟）">
            <input
              type="number"
              min={5}
              max={240}
              step={5}
              className="input"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 30)}
            />
          </Field>
        </div>
        <Field label="会议链接（可选）">
          <input
            className="input"
            placeholder="https://zoom.us/j/… 或 腾讯会议链接"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </Field>
        <div className="mt-3 flex justify-end">
          <button className="btn btn-primary" disabled={pending} onClick={approve}>
            {pending ? "确认中……" : "确认并安排"}
          </button>
        </div>
      </div>

      <div className="border-t border-ink-200 pt-4">
        <h3 className="text-sm font-semibold text-ink-900 mb-2">或者拒绝</h3>
        <Field label="说明（可选，将展示给学生）">
          <textarea
            className="input"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <div className="mt-3 flex justify-end">
          <button
            className="btn btn-danger"
            disabled={pending}
            onClick={reject}
          >
            拒绝申请
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Scheduled + past meetings. Three collapsible sections below the
// header: Agenda, Notes & AI Extract, Reflection (student only).
// ------------------------------------------------------------------
function ScheduledOrPastView({
  profile,
  meeting,
  reflections,
  canManage,
  isStudent,
  isPast,
  onClose,
  setErr,
}: {
  profile: Profile;
  meeting: Meeting;
  reflections: MeetingReflection[];
  canManage: boolean;
  isStudent: boolean;
  isPast: boolean;
  onClose: () => void;
  setErr: (e: string | null) => void;
}) {
  return (
    <div className="space-y-5">
      <HeaderBlock
        meeting={meeting}
        canManage={canManage}
        onClose={onClose}
        setErr={setErr}
      />

      <AgendaBlock
        meeting={meeting}
        canManage={canManage}
        isPast={isPast}
        setErr={setErr}
      />

      {(canManage || isPast) && (
        <NotesBlock
          meeting={meeting}
          canManage={canManage}
          setErr={setErr}
        />
      )}

      {isStudent && isPast ? (
        <ReflectionBlock
          meeting={meeting}
          reflections={reflections}
          setErr={setErr}
        />
      ) : null}

      {canManage ? (
        <DangerZone meeting={meeting} onClose={onClose} setErr={setErr} />
      ) : null}
    </div>
  );
}

// ----- header (title / when / link + inline edit for counselor) -----
function HeaderBlock({
  meeting,
  canManage,
  onClose,
  setErr,
}: {
  meeting: Meeting;
  canManage: boolean;
  onClose: () => void;
  setErr: (e: string | null) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(meeting.title);
  const [when, setWhen] = useState(toLocalDatetimeInputValue(meeting.scheduled_at));
  const [duration, setDuration] = useState(meeting.duration_minutes ?? 30);
  const [link, setLink] = useState(meeting.meeting_link ?? "");
  const [pending, start] = useTransition();

  // Keep local state in sync if parent re-renders with a new meeting row.
  useEffect(() => {
    setTitle(meeting.title);
    setWhen(toLocalDatetimeInputValue(meeting.scheduled_at));
    setDuration(meeting.duration_minutes ?? 30);
    setLink(meeting.meeting_link ?? "");
  }, [meeting.id, meeting.title, meeting.scheduled_at, meeting.duration_minutes, meeting.meeting_link]);

  const save = () => {
    if (!title.trim()) {
      setErr("请填写标题。");
      return;
    }
    setErr(null);
    start(async () => {
      try {
        await saveMeeting({
          id: meeting.id,
          title: title.trim(),
          scheduled_at: when ? new Date(when).toISOString() : null,
          duration_minutes: duration,
          meeting_link: link.trim() || null,
          agenda: meeting.agenda ?? [],
        });
        router.refresh();
        setEditing(false);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs text-ink-500">
            {fmtMeetingDateTime(meeting.scheduled_at)}
            {meeting.duration_minutes ? ` · ${meeting.duration_minutes} 分钟` : ""}
          </div>
          <div className="mt-1 text-lg font-semibold text-ink-900">
            {meeting.title}
          </div>
          {meeting.meeting_link ? (
            <a
              href={meeting.meeting_link}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 break-all"
            >
              加入会议 ↗
            </a>
          ) : null}
        </div>
        {canManage ? (
          <button className="btn" onClick={() => setEditing(true)}>
            编辑
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="card p-3 bg-ink-50/50">
      <Field label="标题">
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <Field label="时间">
          <input
            type="datetime-local"
            className="input"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </Field>
        <Field label="时长（分钟）">
          <input
            type="number"
            className="input"
            min={5}
            max={240}
            step={5}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value) || 30)}
          />
        </Field>
      </div>
      <Field label="会议链接">
        <input
          className="input"
          placeholder="https://zoom.us/j/… 或 腾讯会议链接"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
      </Field>
      <div className="mt-3 flex justify-end gap-2">
        <button
          className="btn"
          disabled={pending}
          onClick={() => setEditing(false)}
        >
          取消
        </button>
        <button className="btn btn-primary" disabled={pending} onClick={save}>
          {pending ? "保存中……" : "保存"}
        </button>
      </div>
    </div>
  );
}

// ----- agenda: editable for counselor (add/check/remove items + AI) -----
function AgendaBlock({
  meeting,
  canManage,
  isPast,
  setErr,
}: {
  meeting: Meeting;
  canManage: boolean;
  isPast: boolean;
  setErr: (e: string | null) => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<AgendaItem[]>(meeting.agenda ?? []);
  const [newItem, setNewItem] = useState("");
  const [pending, start] = useTransition();
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    setItems(meeting.agenda ?? []);
  }, [meeting.id, meeting.agenda]);

  const persist = (next: AgendaItem[]) => {
    setItems(next);
    setErr(null);
    start(async () => {
      try {
        await saveMeeting({
          id: meeting.id,
          title: meeting.title,
          scheduled_at: meeting.scheduled_at,
          duration_minutes: meeting.duration_minutes,
          meeting_link: meeting.meeting_link,
          agenda: next,
        });
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  const addItem = () => {
    if (!newItem.trim()) return;
    const next = [
      ...items,
      { id: crypto.randomUUID(), text: newItem.trim(), done: false },
    ];
    setNewItem("");
    persist(next);
  };

  const toggleItem = (id: string) => {
    persist(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  };

  const removeItem = (id: string) => {
    persist(items.filter((i) => i.id !== id));
  };

  const updateItem = (id: string, text: string) => {
    persist(items.map((i) => (i.id === id ? { ...i, text } : i)));
  };

  const suggestWithAI = async () => {
    setErr(null);
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/meeting-agenda", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meetingId: meeting.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(j.error ?? "AI 请求失败");
      }
      const j: { items: string[] } = await res.json();
      // Append AI suggestions after any existing items so counselor keeps
      // context and can prune.
      const next: AgendaItem[] = [
        ...items,
        ...j.items.map((text) => ({
          id: crypto.randomUUID(),
          text,
          done: false,
        })),
      ];
      persist(next);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-ink-900">议程</h3>
        {canManage ? (
          <button
            onClick={suggestWithAI}
            disabled={aiLoading || pending}
            className="btn btn-ghost text-xs text-brand-600"
          >
            {aiLoading ? "思考中……" : "✨ 让 AI 建议"}
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="card p-3 text-sm text-ink-500 italic">
          {canManage
            ? "还没有议程。可以手动添加，或让 AI 帮你建议几条。"
            : "还没有议程。"}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2 group">
              <input
                type="checkbox"
                className="mt-1 accent-brand-500"
                checked={!!item.done}
                onChange={() => toggleItem(item.id)}
                disabled={!canManage && !isPast}
              />
              {canManage ? (
                <AgendaEditableText
                  value={item.text}
                  onChange={(v) => updateItem(item.id, v)}
                />
              ) : (
                <span
                  className={`text-sm flex-1 ${
                    item.done ? "line-through text-ink-400" : "text-ink-800"
                  }`}
                >
                  {item.text}
                </span>
              )}
              {canManage ? (
                <button
                  className="text-ink-300 hover:text-rose-600 text-sm opacity-0 group-hover:opacity-100"
                  onClick={() => removeItem(item.id)}
                  aria-label="删除条目"
                >
                  ✕
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <div className="mt-2 flex gap-2">
          <input
            className="input flex-1"
            placeholder="新增一条议程……"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addItem();
            }}
          />
          <button className="btn" onClick={addItem} disabled={!newItem.trim()}>
            添加
          </button>
        </div>
      ) : null}
    </section>
  );
}

function AgendaEditableText({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <input
      className="flex-1 bg-transparent border-0 border-b border-transparent hover:border-ink-200 focus:border-brand-500 focus:outline-none text-sm py-0.5"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onChange(local);
      }}
    />
  );
}

// ----- notes + AI extract + suggestions with approve/reject -----
function NotesBlock({
  meeting,
  canManage,
  setErr,
}: {
  meeting: Meeting;
  canManage: boolean;
  setErr: (e: string | null) => void;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(meeting.notes ?? "");
  const [dirty, setDirty] = useState(false);
  const [saving, startSave] = useTransition();
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    setNotes(meeting.notes ?? "");
    setDirty(false);
  }, [meeting.id, meeting.notes]);

  const saveNotes = (markCompleted: boolean) => {
    setErr(null);
    startSave(async () => {
      try {
        await saveMeetingNotes(meeting.id, notes, { markCompleted });
        router.refresh();
        setDirty(false);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  const extract = async () => {
    if (!notes.trim()) {
      setErr("先写一些笔记，再让 AI 提炼。");
      return;
    }
    if (dirty) {
      // Persist first so the API sees the latest content.
      await new Promise<void>((resolve) =>
        startSave(async () => {
          try {
            await saveMeetingNotes(meeting.id, notes, { markCompleted: true });
            setDirty(false);
          } finally {
            resolve();
          }
        })
      );
    }
    setErr(null);
    setExtracting(true);
    try {
      const res = await fetch("/api/ai/meeting-extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meetingId: meeting.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(j.error ?? "AI 请求失败");
      }
      const j: {
        extract: MeetingAIExtract;
        suggestions: Array<{
          kind: MeetingSuggestion["kind"];
          title: string;
          rationale: string;
        }>;
      } = await res.json();
      await setMeetingAIExtract(meeting.id, j.extract, j.suggestions);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setExtracting(false);
    }
  };

  return (
    <section>
      <h3 className="text-sm font-semibold text-ink-900 mb-2">会谈笔记</h3>

      {canManage ? (
        <>
          <textarea
            className="input"
            rows={5}
            placeholder="把会谈内容贴进来或直接打字记录……"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setDirty(true);
            }}
          />
          <div className="mt-2 flex flex-wrap gap-2 justify-end">
            <button
              className="btn btn-ghost text-brand-600 text-xs"
              disabled={extracting || saving || !notes.trim()}
              onClick={extract}
            >
              {extracting ? "提炼中……" : "✨ 让 AI 提炼"}
            </button>
            <button
              className="btn"
              disabled={saving || !dirty}
              onClick={() => saveNotes(false)}
            >
              {saving ? "保存中……" : "保存笔记"}
            </button>
            <button
              className="btn btn-primary"
              disabled={saving || !notes.trim()}
              onClick={() => saveNotes(true)}
            >
              {saving ? "保存中……" : "保存并标记为已结束"}
            </button>
          </div>
        </>
      ) : meeting.notes ? (
        <div className="card p-3 bg-ink-50/50 text-sm whitespace-pre-wrap text-ink-800">
          {meeting.notes}
        </div>
      ) : (
        <div className="card p-3 text-sm text-ink-500 italic">
          暂无笔记。
        </div>
      )}

      {meeting.ai_extracted ? (
        <div className="mt-4 card p-4 bg-brand-50/60 border-brand-200">
          <div className="text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1">
            AI 摘要
          </div>
          <div className="text-sm text-ink-800 whitespace-pre-wrap">
            {meeting.ai_extracted.summary}
          </div>
          {meeting.ai_extracted.key_updates &&
          meeting.ai_extracted.key_updates.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-sm text-ink-800 space-y-0.5">
              {meeting.ai_extracted.key_updates.map((k, i) => (
                <li key={i}>{k}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {meeting.ai_suggestions && meeting.ai_suggestions.length > 0 ? (
        <SuggestionList
          meeting={meeting}
          canManage={canManage}
          setErr={setErr}
        />
      ) : null}
    </section>
  );
}

function SuggestionList({
  meeting,
  canManage,
  setErr,
}: {
  meeting: Meeting;
  canManage: boolean;
  setErr: (e: string | null) => void;
}) {
  const router = useRouter();
  const [deciding, setDeciding] = useState<string | null>(null);

  const decide = async (
    id: string,
    decision: "accepted" | "rejected"
  ) => {
    setErr(null);
    setDeciding(id);
    try {
      await decideMeetingSuggestion(meeting.id, id, decision);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setDeciding(null);
    }
  };

  const items = meeting.ai_suggestions;

  const kindLabel: Record<MeetingSuggestion["kind"], string> = {
    goal: "目标",
    task: "任务",
    timeline: "时间线",
    narrative: "叙事线索",
    other: "其他",
  };
  const statusLabel: Record<MeetingSuggestion["status"], string> = {
    pending: "待处理",
    accepted: "已采纳",
    rejected: "已拒绝",
  };

  return (
    <div className="mt-4">
      <div className="text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
        AI 建议的调整
      </div>
      <ul className="space-y-2">
        {items.map((s) => (
          <li
            key={s.id}
            className={`card p-3 ${
              s.status === "accepted"
                ? "border-emerald-200 bg-emerald-50/40"
                : s.status === "rejected"
                  ? "border-ink-200 bg-ink-50 opacity-70"
                  : "border-amber-200 bg-amber-50/40"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="chip bg-ink-100 text-ink-700 text-[10px]">
                    {kindLabel[s.kind] ?? s.kind}
                  </span>
                  <span className="text-sm font-medium text-ink-900">
                    {s.title}
                  </span>
                </div>
                <div className="text-xs text-ink-600 mt-1">{s.rationale}</div>
              </div>
              {canManage && s.status === "pending" ? (
                <div className="flex gap-1 shrink-0">
                  <button
                    className="btn btn-primary text-xs py-1 px-2"
                    disabled={deciding === s.id}
                    onClick={() => decide(s.id, "accepted")}
                  >
                    采纳
                  </button>
                  <button
                    className="btn btn-danger text-xs py-1 px-2"
                    disabled={deciding === s.id}
                    onClick={() => decide(s.id, "rejected")}
                  >
                    拒绝
                  </button>
                </div>
              ) : (
                <span
                  className={`chip shrink-0 ${
                    s.status === "accepted"
                      ? "bg-emerald-100 text-emerald-800"
                      : s.status === "rejected"
                        ? "bg-ink-200 text-ink-600"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {statusLabel[s.status] ?? s.status}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {canManage ? (
        <p className="mt-2 text-xs text-ink-500">
          采纳只是记录你的决定。实际的编辑（目标、任务或时间线）仍然需要在对应的模块里完成。
        </p>
      ) : null}
    </div>
  );
}

// ----- student-only reflection (append-only, private) -----
function ReflectionBlock({
  meeting,
  reflections,
  setErr,
}: {
  meeting: Meeting;
  reflections: MeetingReflection[];
  setErr: (e: string | null) => void;
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [saving, start] = useTransition();

  const add = () => {
    if (!content.trim()) return;
    setErr(null);
    start(async () => {
      try {
        await addReflection(meeting.id, content.trim());
        setContent("");
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  const summarize = async (reflectionId: string) => {
    setErr(null);
    try {
      const res = await fetch("/api/ai/reflection-summary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reflectionId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(j.error ?? "AI 请求失败");
      }
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <section>
      <h3 className="text-sm font-semibold text-ink-900 mb-1">
        你的反思
      </h3>
      <p className="text-xs text-ink-500 mb-2">
        只有你能看到。顾问和家长都看不到这里的内容。条目一旦写下就不会被改动或删除，想写多少都行。
      </p>

      {reflections.length > 0 ? (
        <ul className="space-y-2 mb-3">
          {reflections.map((r) => (
            <li key={r.id} className="card p-3">
              <div className="text-[11px] text-ink-400 mb-1">
                {new Date(r.created_at).toLocaleString("zh-CN")}
              </div>
              <div className="text-sm whitespace-pre-wrap text-ink-800">
                {r.content}
              </div>
              {r.ai_summary ? (
                <div className="mt-2 border-t border-ink-100 pt-2">
                  <div className="text-[11px] font-semibold text-brand-700 uppercase tracking-wider mb-1">
                    叙事摘要
                  </div>
                  <div className="text-sm text-ink-800 whitespace-pre-wrap">
                    {r.ai_summary}
                  </div>
                </div>
              ) : (
                <div className="mt-2">
                  <button
                    onClick={() => summarize(r.id)}
                    className="btn btn-ghost text-xs text-brand-600"
                  >
                    ✨ 为我的叙事线索提炼
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <textarea
        className="input"
        rows={4}
        placeholder="有什么让你印象深刻？有什么出乎意料？有什么想记下的？"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="mt-2 flex justify-end">
        <button
          className="btn btn-primary"
          disabled={saving || !content.trim()}
          onClick={add}
        >
          {saving ? "保存中……" : "保存反思"}
        </button>
      </div>
    </section>
  );
}

// ----- small danger zone for counselor -----
function DangerZone({
  meeting,
  onClose,
  setErr,
}: {
  meeting: Meeting;
  onClose: () => void;
  setErr: (e: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const doCancel = () => {
    if (!confirm("要取消这次会谈吗？它会移到已取消列表。"))
      return;
    setErr(null);
    start(async () => {
      try {
        await cancelMeeting(meeting.id);
        router.refresh();
        onClose();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  const doDelete = () => {
    if (
      !confirm(
        "确认永久删除这次会谈吗？与之相关的笔记与反思也会一并删除。"
      )
    )
      return;
    setErr(null);
    start(async () => {
      try {
        await deleteMeeting(meeting.id);
        router.refresh();
        onClose();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  return (
    <div className="border-t border-ink-200 pt-3 flex justify-end gap-2">
      {meeting.status === "scheduled" ? (
        <button className="btn" disabled={pending} onClick={doCancel}>
          取消会谈
        </button>
      ) : null}
      <button className="btn btn-danger" disabled={pending} onClick={doDelete}>
        删除
      </button>
    </div>
  );
}

// ------------------------------------------------------------------
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function defaultDatetime(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

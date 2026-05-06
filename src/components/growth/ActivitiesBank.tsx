"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Activity, Profile } from "@/types/db";
import { roleLabel } from "@/lib/permissions";
import { deleteActivity, saveActivity } from "@/app/actions/activities";

interface Props {
  activities: Activity[];
  canEdit: boolean;
  creators: Record<string, { name: string; role: string }>;
  setErr: (e: string | null) => void;
}

export function ActivitiesBank({
  activities,
  canEdit,
  creators,
  setErr,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {canEdit ? (
        <div className="flex justify-end">
          <button
            className="btn"
            onClick={() => {
              setAdding((v) => !v);
              setEditingId(null);
            }}
          >
            {adding ? "取消" : "+ 新增活动"}
          </button>
        </div>
      ) : null}

      {adding ? (
        <Editor
          onCancel={() => setAdding(false)}
          onSaved={() => setAdding(false)}
          setErr={setErr}
        />
      ) : null}

      {activities.length === 0 && !adding ? (
        <div className="card p-4 text-sm text-ink-500 italic">
          还没有活动。把你在做的事、做它的原因、从中学到的东西记下来——先写得糙一点也没关系，慢慢打磨。
        </div>
      ) : null}

      <ul className="grid gap-3 md:grid-cols-2">
        {activities.map((a) =>
          editingId === a.id ? (
            <li key={a.id} className="md:col-span-2">
              <Editor
                initial={a}
                onCancel={() => setEditingId(null)}
                onSaved={() => setEditingId(null)}
                setErr={setErr}
              />
            </li>
          ) : (
            <li key={a.id}>
              <ActivityCard
                activity={a}
                canEdit={canEdit}
                creator={a.created_by ? creators[a.created_by] : undefined}
                onEdit={() => {
                  setEditingId(a.id);
                  setAdding(false);
                }}
                setErr={setErr}
              />
            </li>
          )
        )}
      </ul>
    </div>
  );
}

function ActivityCard({
  activity,
  canEdit,
  creator,
  onEdit,
  setErr,
}: {
  activity: Activity;
  canEdit: boolean;
  creator?: { name: string; role: string };
  onEdit: () => void;
  setErr: (e: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [summary, setSummary] = useState<string | null>(activity.ai_summary);

  const remove = () => {
    if (!confirm("确认删除这个活动？")) return;
    setErr(null);
    start(async () => {
      try {
        await deleteActivity(activity.id);
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  const frame = () => {
    setErr(null);
    start(async () => {
      try {
        const res = await fetch("/api/ai/activity-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activityId: activity.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "生成失败，请稍后再试。");
        setSummary(json.summary);
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  return (
    <div className="card p-3 flex flex-col h-full">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-ink-900 break-words">
            {activity.title}
          </div>
          <DateChip a={activity} />
        </div>
        {canEdit ? (
          <div className="flex gap-1 shrink-0">
            <button
              className="btn btn-ghost text-xs py-0.5 px-1.5"
              onClick={onEdit}
              disabled={pending}
            >
              编辑
            </button>
            <button
              className="btn btn-ghost text-xs py-0.5 px-1.5 text-rose-600"
              onClick={remove}
              disabled={pending}
              aria-label="删除活动"
            >
              ✕
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-2 space-y-2 text-sm">
        <Field label="做了什么" value={activity.description} />
        <Field label="为什么做" value={activity.motivation} />
        <Field label="学到什么" value={activity.learning_outcomes} />
        <Field
          label="与叙事的联系"
          value={activity.narrative_relevance}
        />
      </div>

      <div className="mt-3 pt-2 border-t border-ink-100">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-500">
            AI 提炼
          </div>
          {canEdit ? (
            <button
              className="btn btn-ghost text-xs py-0.5 px-1.5"
              onClick={frame}
              disabled={pending}
            >
              {pending ? "思考中……" : summary ? "刷新" : "让 AI 提炼"}
            </button>
          ) : null}
        </div>
        {summary ? (
          <p className="text-sm text-ink-700 italic mt-1">{summary}</p>
        ) : (
          <p className="text-xs text-ink-400 italic mt-1">
            还没有。只要写下动机或学习收获中的一项，就能让 AI 围绕你的主题，用 2–3 句话把它提炼出来。
          </p>
        )}
      </div>

      {creator ? (
        <p className="text-[11px] text-ink-400 mt-2">
          由 {creator.name}
          {creator.role && creator.role !== "student"
            ? `（${roleLabel[creator.role as Profile["role"]] ?? creator.role}）`
            : ""} 添加
        </p>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-500">
        {label}
      </div>
      {value ? (
        <p className="text-ink-700 whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="text-ink-400 italic text-xs">—</p>
      )}
    </div>
  );
}

function DateChip({ a }: { a: Activity }) {
  const parts: string[] = [];
  if (a.role_label) parts.push(a.role_label);
  if (a.start_date || a.end_date) {
    parts.push(`${fmtDate(a.start_date)} – ${fmtDate(a.end_date) || "至今"}`);
  }
  if (a.hours_per_week) parts.push(`每周 ${a.hours_per_week} 小时`);
  if (parts.length === 0) return null;
  return (
    <div className="text-xs text-ink-500 mt-0.5 truncate">
      {parts.join(" · ")}
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try {
    const [y, m] = iso.split("-").map(Number);
    return new Date(y, (m || 1) - 1).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

// ------- editor -------
function Editor({
  initial,
  onCancel,
  onSaved,
  setErr,
}: {
  initial?: Activity;
  onCancel: () => void;
  onSaved: () => void;
  setErr: (e: string | null) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [roleLbl, setRoleLbl] = useState(initial?.role_label ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [motiv, setMotiv] = useState(initial?.motivation ?? "");
  const [learn, setLearn] = useState(initial?.learning_outcomes ?? "");
  const [relev, setRelev] = useState(initial?.narrative_relevance ?? "");
  const [startDate, setStartDate] = useState(initial?.start_date ?? "");
  const [endDate, setEndDate] = useState(initial?.end_date ?? "");
  const [hours, setHours] = useState<number | "">(
    initial?.hours_per_week ?? ""
  );
  const [pending, start] = useTransition();

  const submit = () => {
    if (!title.trim()) {
      setErr("请给这个活动起个标题。");
      return;
    }
    setErr(null);
    start(async () => {
      try {
        await saveActivity({
          id: initial?.id,
          title: title.trim(),
          role_label: roleLbl.trim() || null,
          description: desc.trim() || null,
          motivation: motiv.trim() || null,
          learning_outcomes: learn.trim() || null,
          narrative_relevance: relev.trim() || null,
          start_date: startDate || null,
          end_date: endDate || null,
          hours_per_week:
            typeof hours === "number" && hours > 0 ? hours : null,
        });
        router.refresh();
        onSaved();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  return (
    <div className="card p-3 border-brand-200 bg-brand-50/30 space-y-2">
      <div className="grid md:grid-cols-2 gap-2">
        <div>
          <label className="label">标题</label>
          <input
            className="input"
            placeholder="例如：旧衣改造社团"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="label">角色（可选）</label>
          <input
            className="input"
            placeholder="例如：联合发起人、志愿者、成员"
            value={roleLbl}
            onChange={(e) => setRoleLbl(e.target.value)}
          />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-2">
        <div>
          <label className="label">开始</label>
          <input
            type="date"
            className="input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="label">结束（如果持续进行中请留空）</label>
          <input
            type="date"
            className="input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div>
          <label className="label">每周小时数</label>
          <input
            type="number"
            min={1}
            max={80}
            className="input"
            value={hours}
            onChange={(e) =>
              setHours(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </div>
      </div>

      <EditorField
        label="做了什么"
        value={desc}
        onChange={setDesc}
        placeholder="具体的工作——做了什么、做成了什么、组织或练习了什么。"
      />
      <EditorField
        label="为什么做（动机）"
        value={motiv}
        onChange={setMotiv}
        placeholder="什么吸引了你？你想实现什么、理解什么？"
      />
      <EditorField
        label="学到什么"
        value={learn}
        onChange={setLearn}
        placeholder="让你发生改变的技能、视角，或失败。"
      />
      <EditorField
        label="与叙事的联系"
        value={relev}
        onChange={setRelev}
        placeholder="这和你是谁、要往哪里去，有什么关联？"
      />

      <div className="flex justify-end gap-2 pt-1">
        <button
          className="btn btn-ghost text-xs"
          onClick={onCancel}
          disabled={pending}
        >
          取消
        </button>
        <button
          className="btn btn-primary text-xs"
          onClick={submit}
          disabled={pending || !title.trim()}
        >
          {pending ? "保存中……" : initial ? "保存" : "新增活动"}
        </button>
      </div>
    </div>
  );
}

function EditorField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <textarea
        className="input"
        rows={2}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

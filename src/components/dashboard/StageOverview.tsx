"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { FocusArea, Profile, Stage } from "@/types/db";
import { can } from "@/lib/permissions";
import { fmtDate, toISO, today, addMonths } from "@/lib/dates";
import { upsertStage } from "@/app/actions/stage";
import { useRouter } from "next/navigation";

interface Props {
  profile: Profile;
  stage: Stage | null;
}

// Empty-form defaults. These only show up if the counselor opens the
// editor without running AI generation — the AI path rewrites them.
const DEFAULT_AREAS: FocusArea[] = [
  { area: "学术", note: "" },
  { area: "课外活动", note: "" },
  { area: "标化考试", note: "" },
  { area: "作品集", note: "" },
  { area: "个人成长", note: "" },
  { area: "申请准备", note: "" },
];

export function StageOverview({ profile, stage }: Props) {
  const canEdit = can.editStage(profile.role);
  const [editing, setEditing] = useState(false);
  const t = useTranslations();

  if (!stage && !editing) {
    return (
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
              {t("dashboard.stage.heading")}
            </div>
            <h2 className="text-lg font-semibold text-ink-900 mt-0.5">
              还没有定义当前阶段
            </h2>
          </div>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setEditing(true)}>
              定义当前阶段
            </button>
          )}
        </div>
        <p className="text-sm text-ink-600">
          阶段概览是整张计划的锚点——它回答了在这一段时间里，我们<em>为什么</em>要把注意力放在学术、课外、考试、作品集、个人成长与申请准备这些方向上。
        </p>
      </div>
    );
  }

  if (editing) {
    return (
      <StageEditor
        initial={stage}
        onCancel={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    );
  }

  return (
    <StageDisplay
      stage={stage!}
      canEdit={canEdit}
      onEdit={() => setEditing(true)}
    />
  );
}

function StageDisplay({
  stage,
  canEdit,
  onEdit,
}: {
  stage: Stage;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations();
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
            {t("dashboard.stage.heading")}
          </div>
          <h2 className="text-lg font-semibold text-ink-900 mt-0.5">
            {stage.title}
          </h2>
          <div className="text-xs text-ink-600 mt-0.5">
            {fmtDate(stage.start_date)} → {fmtDate(stage.end_date)}
          </div>
        </div>
        {canEdit && (
          <button className="btn" onClick={onEdit}>
            {t("common.edit")}
          </button>
        )}
      </div>

      {stage.why_it_matters && (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold mb-1">
            {t("dashboard.stage.why")}
          </div>
          <p className="text-sm text-ink-900 leading-relaxed">
            {stage.why_it_matters}
          </p>
        </div>
      )}

      {stage.focus_areas.length > 0 && (
        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold mb-2">
            {t("dashboard.stage.focusAreas")}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {stage.focus_areas.map((a, i) => (
              <div
                key={`${a.area}-${i}`}
                className="border border-ink-200 rounded-lg p-3 bg-ink-50/40"
              >
                <div className="text-xs font-semibold text-ink-900">
                  {a.area}
                </div>
                <NoteBody text={a.note} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Renders a focus-area note. The AI is asked to write notes as a series
// of `- ...` lines, but counselors who edit by hand may also use plain
// paragraph text. Detect bullet lines and render either way nicely.
function NoteBody({ text }: { text: string }) {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) {
    return (
      <p className="text-sm text-ink-400 italic mt-1">（暂无内容）</p>
    );
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // If at least one line starts with a bullet marker, render the whole
  // thing as a list. Lines without a marker get a leading bullet too so
  // the rhythm stays consistent.
  const hasBullet = lines.some((l) => /^[-•·*]\s+/.test(l));

  if (hasBullet) {
    const items = lines.map((l) => l.replace(/^[-•·*]\s+/, ""));
    return (
      <ul className="mt-1 space-y-1">
        {items.map((item, i) => (
          <li
            key={i}
            className="text-sm text-ink-700 leading-relaxed flex gap-2"
          >
            <span className="text-ink-400 shrink-0 mt-[2px]">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }

  // Plain prose — preserve paragraphs but no bullet markers.
  return (
    <div className="mt-1 space-y-1">
      {lines.map((para, i) => (
        <p key={i} className="text-sm text-ink-600 leading-relaxed">
          {para}
        </p>
      ))}
    </div>
  );
}

function StageEditor({
  initial,
  onCancel,
  onSaved,
}: {
  initial: Stage | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const t = useTranslations();
  const startDefault = initial?.start_date ?? toISO(today());
  const endDefault = initial?.end_date ?? toISO(addMonths(today(), 3));

  const [title, setTitle] = useState(initial?.title ?? "");
  const [startDate, setStartDate] = useState(startDefault);
  const [endDate, setEndDate] = useState(endDefault);
  const [whyItMatters, setWhyItMatters] = useState(
    initial?.why_it_matters ?? ""
  );
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>(
    initial?.focus_areas.length ? initial.focus_areas : DEFAULT_AREAS
  );
  const [context, setContext] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "ai" | null>(null);
  const [aiFilled, setAiFilled] = useState(initial?.ai_generated ?? false);

  const updateArea = (i: number, patch: Partial<FocusArea>) => {
    setFocusAreas((prev) =>
      prev.map((a, j) => (i === j ? { ...a, ...patch } : a))
    );
    setAiFilled(false);
  };
  const addArea = () =>
    setFocusAreas((prev) => [...prev, { area: "", note: "" }]);
  const removeArea = (i: number) =>
    setFocusAreas((prev) => prev.filter((_, j) => j !== i));

  // Has the counselor put any actual content into the draft yet? Used to
  // decide whether the AI button is "polish my draft" or "start fresh".
  const hasDraft =
    !!title.trim() ||
    !!whyItMatters.trim() ||
    focusAreas.some((a) => a.note.trim()) ||
    !!context.trim();

  const generate = async () => {
    setErr(null);
    setBusy("ai");
    try {
      const res = await fetch("/api/ai/stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          studentContext: context,
          gradeLevel: title,
          draftTitle: title,
          draftWhyItMatters: whyItMatters,
          draftFocusAreas: focusAreas,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error ?? "AI 整理失败。");
        return;
      }
      setTitle(json.title);
      setWhyItMatters(json.whyItMatters);
      setFocusAreas(json.focusAreas);
      setAiFilled(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setErr(null);
    setBusy("save");
    try {
      await upsertStage({
        id: initial?.id,
        title,
        startDate,
        endDate,
        whyItMatters,
        focusAreas,
        aiGenerated: aiFilled,
      });
      router.refresh();
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
            {t("dashboard.stage.heading")}
          </div>
          <h2 className="text-base font-semibold text-ink-900 mt-0.5">
            {initial ? "编辑阶段" : "定义当前阶段"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn"
            onClick={generate}
            disabled={busy !== null}
            title={
              hasDraft
                ? "把上面已经写下的草稿整理成清楚、有条理的版本（不会编造你没写过的内容）"
                : "你还没写任何内容——AI 会基于日期窗口起一个朴素的开局框架，等你补充"
            }
          >
            {busy === "ai"
              ? "整理中……"
              : hasDraft
                ? "用 AI 整理"
                : "用 AI 起一个开局框架"}
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div className="sm:col-span-2">
          <label className="label">阶段标题</label>
          <input
            className="input"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setAiFilled(false);
            }}
            placeholder="例如：高一下学期——探索与基础搭建"
          />
        </div>
        <div>
          <label className="label">开始日期</label>
          <input
            type="date"
            className="input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="label">结束日期</label>
          <input
            type="date"
            className="input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <div className="mb-3">
        <label className="label">
          额外上下文（可选——主要在下面六个方向里写草稿，这里只放无处安放的零碎补充）
        </label>
        <textarea
          className="input min-h-[60px]"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="例如：家庭刚刚搬到湾区、学校刚换、最近一个月睡眠不好……（中英皆可）"
        />
      </div>

      <div className="mb-3">
        <label className="label">为什么这个阶段重要</label>
        <textarea
          className="input min-h-[80px]"
          value={whyItMatters}
          onChange={(e) => {
            setWhyItMatters(e.target.value);
            setAiFilled(false);
          }}
          placeholder="这个阶段在学生整段历程中承担什么角色？"
        />
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="label !mb-0">重点方向</label>
          <button type="button" className="btn btn-ghost text-xs" onClick={addArea}>
            + 添加方向
          </button>
        </div>
        <div className="space-y-2">
          {focusAreas.map((a, i) => (
            <div
              key={i}
              className="grid grid-cols-[10rem_1fr_auto] gap-2 items-start"
            >
              <input
                className="input"
                value={a.area}
                onChange={(e) => updateArea(i, { area: e.target.value })}
                placeholder="方向"
              />
              <textarea
                className="input min-h-[60px]"
                value={a.note}
                onChange={(e) => updateArea(i, { note: e.target.value })}
                placeholder={
                  "这个方向的策略性说明\n建议每行写一条要点，行首用 - 开头\n例如：\n- 保持核心课程 GPA\n- 评估 11 年级 workload"
                }
              />
              <button
                type="button"
                className="btn btn-ghost text-ink-400 hover:text-rose-600"
                onClick={() => removeArea(i)}
                aria-label="移除方向"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {err && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2.5 py-2 mb-3">
          {err}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button className="btn" onClick={onCancel} disabled={busy !== null}>
          {t("common.cancel")}
        </button>
        <button
          className="btn btn-primary"
          onClick={save}
          disabled={busy !== null}
        >
          {busy === "save" ? "保存中……" : initial ? "保存修改" : "创建阶段"}
        </button>
      </div>
    </div>
  );
}

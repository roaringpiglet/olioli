"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NarrativeEntry, NarrativeKind, Profile } from "@/types/db";
import { roleLabel } from "@/lib/permissions";
import {
  deleteNarrativeEntry,
  saveNarrativeEntry,
} from "@/app/actions/narrative";

interface Props {
  entries: NarrativeEntry[];
  canEdit: boolean;
  creators: Record<string, { name: string; role: string }>;
  setErr: (e: string | null) => void;
}

const KIND_ORDER: NarrativeKind[] = [
  "theme",
  "value",
  "story",
  "growth_area",
  "direction",
];

const KIND_META: Record<
  NarrativeKind,
  { label: string; blurb: string; hint: string; chip: string }
> = {
  theme: {
    label: "主题",
    blurb: "关于「你是谁」的反复出现的意念。",
    hint: "例如：「把衣服当作文化载体」「总是回到系统思维」",
    chip: "bg-brand-100 text-brand-800 border-brand-200",
  },
  value: {
    label: "价值观",
    blurb: "你在乎到愿意一次次选择的东西。",
    hint: "例如：「认真做事」「让别人的声音也有位置」",
    chip: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  story: {
    label: "故事节点",
    blurb: "那些改变或揭示了什么的具体时刻。",
    hint: "例如：「第一次发酵成功的那天」「祖父过世那段时间」",
    chip: "bg-amber-100 text-amber-800 border-amber-200",
  },
  growth_area: {
    label: "成长方向",
    blurb: "你正在用力的边界——当作发展课题来写。",
    hint: "例如：「在小组评审里更早发声」「把草稿真的写完」",
    chip: "bg-rose-100 text-rose-800 border-rose-200",
  },
  direction: {
    label: "前行方向",
    blurb: "整条故事线似乎正在走向哪里。",
    hint: "例如：「承载记忆的服装设计」「社区层面的系统工作」",
    chip: "bg-violet-100 text-violet-800 border-violet-200",
  },
};

export function NarrativeBuilder({
  entries,
  canEdit,
  creators,
  setErr,
}: Props) {
  const [addingKind, setAddingKind] = useState<NarrativeKind | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<NarrativeKind, NarrativeEntry[]>();
    for (const k of KIND_ORDER) map.set(k, []);
    for (const e of entries) {
      map.get(e.kind)?.push(e);
    }
    return map;
  }, [entries]);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {KIND_ORDER.map((kind) => {
        const meta = KIND_META[kind];
        const list = grouped.get(kind) ?? [];
        return (
          <div key={kind} className="card p-3 flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="min-w-0">
                <div
                  className={
                    "inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-semibold " +
                    meta.chip
                  }
                >
                  {meta.label}
                </div>
                <p className="text-xs text-ink-500 mt-1">{meta.blurb}</p>
              </div>
              {canEdit ? (
                <button
                  className="btn btn-ghost text-xs py-1 px-2 shrink-0"
                  onClick={() => {
                    setAddingKind(kind);
                    setEditingId(null);
                  }}
                >
                  + 新增
                </button>
              ) : null}
            </div>

            {addingKind === kind ? (
              <Editor
                kind={kind}
                onCancel={() => setAddingKind(null)}
                onSaved={() => setAddingKind(null)}
                setErr={setErr}
              />
            ) : null}

            {list.length === 0 && addingKind !== kind ? (
              <p className="text-xs text-ink-400 italic mt-2">{meta.hint}</p>
            ) : null}

            {list.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {list.map((e) =>
                  editingId === e.id ? (
                    <li key={e.id}>
                      <Editor
                        kind={e.kind}
                        initial={e}
                        onCancel={() => setEditingId(null)}
                        onSaved={() => setEditingId(null)}
                        setErr={setErr}
                      />
                    </li>
                  ) : (
                    <li key={e.id}>
                      <EntryRow
                        entry={e}
                        canEdit={canEdit}
                        creator={
                          e.created_by ? creators[e.created_by] : undefined
                        }
                        onEdit={() => {
                          setEditingId(e.id);
                          setAddingKind(null);
                        }}
                        setErr={setErr}
                      />
                    </li>
                  )
                )}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function EntryRow({
  entry,
  canEdit,
  creator,
  onEdit,
  setErr,
}: {
  entry: NarrativeEntry;
  canEdit: boolean;
  creator?: { name: string; role: string };
  onEdit: () => void;
  setErr: (e: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const remove = () => {
    if (!confirm("确认删除这条记录？")) return;
    setErr(null);
    start(async () => {
      try {
        await deleteNarrativeEntry(entry.id);
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  return (
    <div className="text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-ink-900 min-w-0 flex-1 break-words">
          {entry.title}
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
              aria-label="删除记录"
            >
              ✕
            </button>
          </div>
        ) : null}
      </div>
      {entry.content ? (
        <p className="text-ink-600 whitespace-pre-wrap mt-0.5">
          {entry.content}
        </p>
      ) : null}
      {creator ? (
        <p className="text-[11px] text-ink-400 mt-0.5">
          {creator.name}
          {creator.role && creator.role !== "student"
            ? `（${roleLabel[creator.role as Profile["role"]] ?? creator.role}）`
            : ""}
        </p>
      ) : null}
    </div>
  );
}

function Editor({
  kind,
  initial,
  onCancel,
  onSaved,
  setErr,
}: {
  kind: NarrativeKind;
  initial?: NarrativeEntry;
  onCancel: () => void;
  onSaved: () => void;
  setErr: (e: string | null) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [pending, start] = useTransition();

  const submit = () => {
    if (!title.trim()) {
      setErr("给这条记录起个简短的标题。");
      return;
    }
    setErr(null);
    start(async () => {
      try {
        await saveNarrativeEntry({
          id: initial?.id,
          kind,
          title: title.trim(),
          content: content.trim() || null,
        });
        router.refresh();
        onSaved();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  return (
    <div className="mt-2 space-y-2 rounded-md border border-brand-200 bg-brand-50/40 p-2">
      <input
        className="input"
        placeholder="简短标题"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      <textarea
        className="input"
        rows={3}
        placeholder={KIND_META[kind].hint}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="flex justify-end gap-2">
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
          {pending ? "保存中……" : initial ? "保存" : "新增"}
        </button>
      </div>
    </div>
  );
}

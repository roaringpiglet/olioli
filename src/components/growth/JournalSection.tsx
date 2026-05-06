"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JournalEntry } from "@/types/db";
import { deleteJournalEntry, saveJournalEntry } from "@/app/actions/journal";

interface Props {
  entries: JournalEntry[];
  setErr: (e: string | null) => void;
}

export function JournalSection({ entries, setErr }: Props) {
  const [open, setOpen] = useState(entries.length === 0);
  const [adding, setAdding] = useState(entries.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="card p-3">
      <button
        className="w-full flex items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <div className="text-sm font-semibold text-ink-900">
            日志
            <span className="ml-2 text-xs font-normal text-ink-500">
              私人 · 只有你能看到
            </span>
          </div>
          <p className="text-xs text-ink-500 mt-0.5">
            随手写。AI 会读取来寻找规律，但不会把原文暴露给顾问。
          </p>
        </div>
        <span className="text-ink-400 text-xs shrink-0">
          共 {entries.length} 条 · {open ? "收起" : "展开"}
        </span>
      </button>

      {open ? (
        <div className="mt-3 space-y-2">
          {!adding ? (
            <button
              className="btn btn-ghost text-xs"
              onClick={() => {
                setAdding(true);
                setEditingId(null);
              }}
            >
              + 新增日志
            </button>
          ) : null}

          {adding ? (
            <Editor
              onCancel={() => setAdding(false)}
              onSaved={() => setAdding(false)}
              setErr={setErr}
            />
          ) : null}

          {entries.length === 0 && !adding ? (
            <p className="text-xs text-ink-400 italic">
              还没有内容。试试用 2 分钟的语音转文字随手倒一段——今天有什么留在心上？
            </p>
          ) : null}

          <ul className="space-y-2">
            {entries.map((e) =>
              editingId === e.id ? (
                <li key={e.id}>
                  <Editor
                    initial={e}
                    onCancel={() => setEditingId(null)}
                    onSaved={() => setEditingId(null)}
                    setErr={setErr}
                  />
                </li>
              ) : (
                <li key={e.id}>
                  <JournalRow
                    entry={e}
                    onEdit={() => {
                      setEditingId(e.id);
                      setAdding(false);
                    }}
                    setErr={setErr}
                  />
                </li>
              )
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function JournalRow({
  entry,
  onEdit,
  setErr,
}: {
  entry: JournalEntry;
  onEdit: () => void;
  setErr: (e: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const remove = () => {
    if (!confirm("确认删除这条日志？")) return;
    setErr(null);
    start(async () => {
      try {
        await deleteJournalEntry(entry.id);
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  return (
    <div className="border border-ink-200 rounded-md p-2 bg-white">
      <div className="flex items-center justify-between gap-2 text-xs text-ink-500">
        <span>{fmtDate(entry.entry_date)}</span>
        <span className="flex gap-1">
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
            aria-label="删除日志"
          >
            ✕
          </button>
        </span>
      </div>
      <p className="text-sm text-ink-800 whitespace-pre-wrap mt-1">
        {entry.content}
      </p>
    </div>
  );
}

function Editor({
  initial,
  onCancel,
  onSaved,
  setErr,
}: {
  initial?: JournalEntry;
  onCancel: () => void;
  onSaved: () => void;
  setErr: (e: string | null) => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState<string>(initial?.entry_date ?? today());
  const [content, setContent] = useState(initial?.content ?? "");
  const [pending, start] = useTransition();

  const submit = () => {
    if (!content.trim()) {
      setErr("至少写一句。");
      return;
    }
    setErr(null);
    start(async () => {
      try {
        await saveJournalEntry({
          id: initial?.id,
          entry_date: date,
          content: content.trim(),
        });
        router.refresh();
        onSaved();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  return (
    <div className="border border-brand-200 bg-brand-50/40 rounded-md p-2 space-y-2">
      <input
        type="date"
        className="input w-auto"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <textarea
        className="input"
        rows={5}
        placeholder="今天心里有什么想说的？"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        autoFocus={!initial}
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
          disabled={pending || !content.trim()}
        >
          {pending ? "保存中……" : initial ? "保存" : "新增日志"}
        </button>
      </div>
    </div>
  );
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtDate(iso: string): string {
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

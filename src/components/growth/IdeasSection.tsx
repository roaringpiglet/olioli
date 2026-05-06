"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { IdeaBoard, Profile } from "@/types/db";
import { roleLabel } from "@/lib/permissions";
import { deleteIdeaBoard, saveIdeaBoard } from "@/app/actions/ideas";
import { Modal } from "@/components/meetings/Modal";

interface Props {
  boards: IdeaBoard[];
  canEdit: boolean;
  creators: Record<string, { name: string; role: string }>;
  setErr: (e: string | null) => void;
  // Lets RemindersSection jump back to a specific board when the user
  // clicks a reminder.
  openBoardIdSignal?: string | null;
  onOpenBoardIdHandled?: () => void;
}

const SUGGESTED_BOARDS: Array<{ title: string; description: string }> = [
  {
    title: "暑期项目",
    description: "我们正在好奇要不要申请的项目。",
  },
  {
    title: "推荐信老师",
    description: "了解我们，可能写出有力推荐信的老师。",
  },
  {
    title: "一起读的书",
    description: "顾问与学生共同的阅读清单。",
  },
  {
    title: "正在抉择的社团",
    description: "这一年里在权衡的几个选项。",
  },
];

export function IdeasSection({
  boards,
  canEdit,
  creators,
  setErr,
  openBoardIdSignal,
  onOpenBoardIdHandled,
}: Props) {
  const [openBoard, setOpenBoard] = useState<IdeaBoard | null>(null);
  const [creating, setCreating] = useState(false);

  // External request to open a specific board (from reminders click).
  useEffect(() => {
    if (!openBoardIdSignal) return;
    const target = boards.find((b) => b.id === openBoardIdSignal);
    if (target) setOpenBoard(target);
    onOpenBoardIdHandled?.();
  }, [openBoardIdSignal, boards, onOpenBoardIdHandled]);

  // Keep the modal copy in sync when the underlying board changes (e.g.
  // after save → router.refresh reloads props).
  useEffect(() => {
    if (!openBoard) return;
    const fresh = boards.find((b) => b.id === openBoard.id);
    if (fresh && fresh.updated_at !== openBoard.updated_at) {
      setOpenBoard(fresh);
    }
  }, [boards, openBoard]);

  const showSuggestions = boards.length === 0 && canEdit && !creating;

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">
            想法与选项
          </h2>
          <p className="text-xs text-ink-500 max-w-2xl">
            给你和顾问一起正在思考的事情开的白板——项目、想请谁写推荐信、要读的书、正在抉择的社团。点击任意一块白板会像文档一样展开，随手记链接、想法、截止日期、看法都可以。
          </p>
        </div>
        {canEdit ? (
          <button
            className="btn"
            onClick={() => setCreating(true)}
          >
            + 新建白板
          </button>
        ) : null}
      </div>

      {showSuggestions ? (
        <SuggestedBoards setErr={setErr} />
      ) : null}

      {boards.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {boards.map((b) => (
            <BoardCard
              key={b.id}
              board={b}
              canEdit={canEdit}
              creator={b.created_by ? creators[b.created_by] : undefined}
              onOpen={() => setOpenBoard(b)}
            />
          ))}
        </div>
      ) : null}

      {boards.length === 0 && !canEdit ? (
        <div className="card p-4 text-sm text-ink-500 italic">
          还没有白板。
        </div>
      ) : null}

      {creating ? (
        <CreateBoardModal
          onClose={() => setCreating(false)}
          onCreated={(b) => {
            setCreating(false);
            setOpenBoard(b);
          }}
          setErr={setErr}
        />
      ) : null}

      {openBoard ? (
        <BoardDocModal
          board={openBoard}
          canEdit={canEdit}
          setErr={setErr}
          onClose={() => setOpenBoard(null)}
        />
      ) : null}
    </section>
  );
}

// ---------- suggested boards empty state ----------
function SuggestedBoards({ setErr }: { setErr: (e: string | null) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState<string | null>(null);

  const add = (title: string, description: string) => {
    setErr(null);
    setAdding(title);
    start(async () => {
      try {
        await saveIdeaBoard({ title, description });
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setAdding(null);
      }
    });
  };

  return (
    <div className="card p-3 bg-ink-50/60 border-dashed">
      <div className="text-xs font-semibold text-ink-600 mb-2">
        快速开始——点一条就能创建对应白板：
      </div>
      <div className="flex flex-wrap gap-2">
        {SUGGESTED_BOARDS.map((s) => (
          <button
            key={s.title}
            className="btn btn-ghost text-xs"
            disabled={pending}
            onClick={() => add(s.title, s.description)}
            title={s.description}
          >
            {adding === s.title ? "创建中……" : `+ ${s.title}`}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- board card (preview) ----------
function BoardCard({
  board,
  canEdit: _canEdit,
  creator,
  onOpen,
}: {
  board: IdeaBoard;
  canEdit: boolean;
  creator?: { name: string; role: string };
  onOpen: () => void;
}) {
  const preview = (board.content ?? "").trim();
  const linkMatches = preview.match(/https?:\/\/\S+/g) ?? [];
  const linkCount = linkMatches.length;
  // Rough character count that treats CJK as 1 char; ASCII words ≈ char/5.
  const charCount = preview.replace(/\s+/g, "").length;

  return (
    <button
      onClick={onOpen}
      className="card p-3 text-left hover:border-brand-300 hover:shadow-sm transition flex flex-col min-h-[9rem] group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink-900 break-words group-hover:text-brand-700">
            {board.title}
          </div>
          {board.description ? (
            <p className="text-xs text-ink-500 mt-0.5">{board.description}</p>
          ) : null}
        </div>
        <span className="text-xs text-ink-400 shrink-0">打开 →</span>
      </div>

      {preview ? (
        <p className="mt-2 text-sm text-ink-600 whitespace-pre-wrap line-clamp-5">
          {preview}
        </p>
      ) : (
        <p className="mt-2 text-xs text-ink-400 italic">
          暂时是空的。点击开始随手记录。
        </p>
      )}

      <div className="mt-auto pt-2 flex items-center justify-between gap-2 text-[11px] text-ink-400">
        <span>
          {charCount > 0 ? `${charCount} 字` : "—"}
          {linkCount > 0 ? ` · ${linkCount} 条链接` : ""}
        </span>
        {creator ? (
          <span className="truncate">
            由 {creator.name}
            {creator.role && creator.role !== "student"
              ? `（${roleLabel[creator.role as Profile["role"]] ?? creator.role}）`
              : ""} 创建
          </span>
        ) : null}
      </div>
    </button>
  );
}

// ---------- create-board modal ----------
function CreateBoardModal({
  onClose,
  onCreated,
  setErr,
}: {
  onClose: () => void;
  onCreated: (b: IdeaBoard) => void;
  setErr: (e: string | null) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [pending, start] = useTransition();

  const submit = () => {
    if (!title.trim()) {
      setErr("请给白板起个名字。");
      return;
    }
    setErr(null);
    start(async () => {
      try {
        const b = await saveIdeaBoard({
          title: title.trim(),
          description: desc.trim() || null,
        });
        router.refresh();
        onCreated(b);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  return (
    <Modal title="新建白板" onClose={onClose} width="md">
      <label className="label">名称</label>
      <input
        className="input mb-3"
        placeholder="例如：暑期项目"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      <label className="label">简短描述（可选）</label>
      <input
        className="input mb-4"
        placeholder="这块白板主要用来记录什么？"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <button className="btn" onClick={onClose} disabled={pending}>
          取消
        </button>
        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={pending || !title.trim()}
        >
          {pending ? "创建中……" : "创建白板"}
        </button>
      </div>
    </Modal>
  );
}

// ---------- board doc modal (the meat of the change) ----------
function BoardDocModal({
  board,
  canEdit,
  setErr,
  onClose,
}: {
  board: IdeaBoard;
  canEdit: boolean;
  setErr: (e: string | null) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [editingHeader, setEditingHeader] = useState(false);
  const [title, setTitle] = useState(board.title);
  const [desc, setDesc] = useState(board.description ?? "");
  const [content, setContent] = useState(board.content ?? "");
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When the user types in the body, debounce-save after a pause.
  useEffect(() => {
    if (!canEdit || !dirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      doSave({ silent: true });
    }, 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // We intentionally don't include doSave in deps; it's stable-ish.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, dirty, canEdit]);

  const doSave = ({ silent }: { silent?: boolean } = {}) => {
    setErr(null);
    start(async () => {
      try {
        await saveIdeaBoard({
          id: board.id,
          title: title.trim() || board.title,
          description: desc.trim() || null,
          content,
        });
        setDirty(false);
        setSavedAt(new Date().toISOString());
        router.refresh();
      } catch (e) {
        if (!silent) setErr((e as Error).message);
      }
    });
  };

  const saveHeader = () => {
    if (!title.trim()) {
      setErr("白板需要一个名字。");
      return;
    }
    setErr(null);
    start(async () => {
      try {
        await saveIdeaBoard({
          id: board.id,
          title: title.trim(),
          description: desc.trim() || null,
          // Don't pass content here — we only want to update header fields.
        });
        setEditingHeader(false);
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  const remove = () => {
    if (
      !confirm(
        `确认删除「${board.title}」吗？整块白板及其内容都会一起删除。`
      )
    )
      return;
    setErr(null);
    start(async () => {
      try {
        await deleteIdeaBoard(board.id);
        router.refresh();
        onClose();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  const onContentChange = (v: string) => {
    setContent(v);
    setDirty(true);
  };

  return (
    <Modal title={board.title} onClose={onClose} width="xl">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          {editingHeader ? (
            <div className="space-y-2">
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <input
                className="input"
                placeholder="简短描述（可选）"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  className="btn btn-primary text-xs"
                  onClick={saveHeader}
                  disabled={pending || !title.trim()}
                >
                  保存
                </button>
                <button
                  className="btn btn-ghost text-xs"
                  onClick={() => {
                    setEditingHeader(false);
                    setTitle(board.title);
                    setDesc(board.description ?? "");
                  }}
                  disabled={pending}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-base font-semibold text-ink-900 break-words">
                {board.title}
              </div>
              {board.description ? (
                <p className="text-xs text-ink-500 mt-0.5">
                  {board.description}
                </p>
              ) : null}
            </>
          )}
        </div>

        {canEdit && !editingHeader ? (
          <div className="flex gap-1 shrink-0">
            <button
              className="btn btn-ghost text-xs"
              onClick={() => setEditingHeader(true)}
            >
              重命名
            </button>
            <button
              className="btn btn-ghost text-xs text-rose-600"
              onClick={remove}
              disabled={pending}
            >
              删除白板
            </button>
          </div>
        ) : null}
      </div>

      <textarea
        className="input font-mono text-sm leading-relaxed"
        rows={16}
        placeholder={
          canEdit
            ? "随手写——关注的项目、链接、截止日期、老师的名字、对每个选项的感觉都行。下方「提醒」刷新时，AI 会自动扫描其中的截止日期。"
            : "这块白板暂时是空的。"
        }
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        readOnly={!canEdit}
      />

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-ink-500 flex-wrap">
        <div>
          {canEdit
            ? dirty
              ? pending
                ? "保存中……"
                : "有未保存的改动"
              : savedAt
                ? `已保存 · ${fmtTimeAgo(savedAt)}`
                : `上次更新 · ${fmtTimeAgo(board.updated_at)}`
            : `上次更新 · ${fmtTimeAgo(board.updated_at)}`}
        </div>
        {canEdit ? (
          <div className="flex gap-2">
            <button
              className="btn btn-ghost text-xs"
              onClick={() => doSave()}
              disabled={pending || !dirty}
            >
              立即保存
            </button>
            <button className="btn text-xs" onClick={onClose}>
              关闭
            </button>
          </div>
        ) : (
          <button className="btn text-xs" onClick={onClose}>
            关闭
          </button>
        )}
      </div>
    </Modal>
  );
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

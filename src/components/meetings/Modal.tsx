"use client";
import { useEffect } from "react";

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: "md" | "lg" | "xl";
}

// Height-capped modal. The outer wrapper centers the dialog; the dialog
// itself owns its max height, pins the header, and scrolls its body —
// so long content never forces the whole page to scroll.
export function Modal({ title, onClose, children, width = "lg" }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const widthCls =
    width === "xl" ? "max-w-3xl" : width === "md" ? "max-w-lg" : "max-w-2xl";

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/40 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`card w-full ${widthCls} shadow-lg flex flex-col max-h-[calc(100vh-2rem)]`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-ink-200 shrink-0">
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          <button
            onClick={onClose}
            className="btn btn-ghost text-ink-500"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
}

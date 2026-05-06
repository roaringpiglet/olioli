"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { requestMeeting } from "@/app/actions/meetings";

interface Props {
  onClose: () => void;
  onRequested: () => void;
  setErr: (e: string | null) => void;
}

export function RequestMeetingModal({
  onClose,
  onRequested,
  setErr,
}: Props) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [preferred, setPreferred] = useState("");
  const [pending, start] = useTransition();

  const submit = () => {
    if (!topic.trim()) {
      setErr("请简单写下你想谈的内容。");
      return;
    }
    setErr(null);
    start(async () => {
      try {
        await requestMeeting({
          topic: topic.trim(),
          preferred_time: preferred.trim() || null,
        });
        router.refresh();
        onRequested();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  return (
    <Modal title="申请一次会谈" onClose={onClose} width="md">
      <p className="text-sm text-ink-600 mb-3">
        顾问会收到邮件提醒，可以确认时间或进一步沟通。写得越具体，会谈效率越高。
      </p>

      <label className="label">想讨论的内容</label>
      <textarea
        className="input mb-3"
        rows={4}
        placeholder="例如：Common App 文书开头卡住了，想一起讨论几个切入角度。"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        autoFocus
      />

      <label className="label">期望的时间（可选）</label>
      <input
        className="input mb-4"
        placeholder="例如：本周二或周三下午都可以"
        value={preferred}
        onChange={(e) => setPreferred(e.target.value)}
      />

      <div className="flex justify-end gap-2">
        <button className="btn" onClick={onClose} disabled={pending}>
          取消
        </button>
        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={pending || !topic.trim()}
        >
          {pending ? "提交中……" : "提交申请"}
        </button>
      </div>
    </Modal>
  );
}

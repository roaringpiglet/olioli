import { fmtMeetingTime } from "@/lib/dates";
import type { Meeting } from "@/types/db";

// AI-facing only. Builds a compact, chronological transcript of past
// completed meetings to be injected into Claude prompts. Chinese string
// literals are kept inline (not routed through next-intl) on purpose —
// this text is never shown to users and should not pay a dictionary
// lookup per LLM call.
//
// limit    — 最多包含最近几次会谈
// maxChars — 每次会谈笔记主体的字符上限
export function renderMeetingHistory(
  meetings: Meeting[],
  opts: { limit?: number; maxChars?: number } = {}
): string {
  const limit = opts.limit ?? 12;
  const maxChars = opts.maxChars ?? 900;

  const done = meetings
    .filter((m) => m.status === "completed")
    .sort((a, b) =>
      (a.scheduled_at ?? a.created_at).localeCompare(
        b.scheduled_at ?? b.created_at
      )
    );

  if (done.length === 0) return "-（暂无历史会谈记录）";

  const slice = done.slice(Math.max(0, done.length - limit));

  return slice
    .map((m) => {
      const when = m.scheduled_at
        ? fmtMeetingTime(m.scheduled_at)
        : "日期未知";
      const body =
        m.ai_extracted?.summary?.trim() ||
        truncate(m.notes ?? "", maxChars) ||
        "（无笔记）";
      const updates =
        m.ai_extracted?.key_updates && m.ai_extracted.key_updates.length > 0
          ? "\n  关键更新：" +
            m.ai_extracted.key_updates.map((u) => `• ${u}`).join(" ")
          : "";
      const accepted = (m.ai_suggestions ?? [])
        .filter((s) => s.status === "accepted")
        .map((s) => `• ${s.title}`)
        .join(" ");
      const acceptedLine = accepted ? `\n  已采纳的后续事项：${accepted}` : "";
      return `- ${when} — 《${m.title}》\n  ${body.replace(/\n+/g, " ")}${updates}${acceptedLine}`;
    })
    .join("\n");
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length <= n ? flat : flat.slice(0, n - 1).trimEnd() + "…";
}

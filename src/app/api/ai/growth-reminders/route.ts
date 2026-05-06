import { NextResponse } from "next/server";
import { loadSession } from "@/lib/session";
import { anthropicModel, getAnthropic } from "@/lib/anthropic";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";
import {
  MIXED_LANGUAGE_INPUT_NOTE,
  PROPER_NOUN_RULE,
} from "@/lib/ai-prompts";
import type {
  GrowthReminder,
  IdeaBoard,
  ReminderUrgency,
} from "@/types/db";

export const runtime = "nodejs";
export const maxDuration = 45;

interface AIReminder {
  title: string;
  detail: string;
  date: string | null;
  urgency: ReminderUrgency;
  source_board_id: string | null;
}

interface AIResponse {
  reminders: AIReminder[];
}

const SYSTEM_PROMPT = `你是一位细致的助手，任务是阅读学生的"想法与选项"笔记，挑出值得提醒 TA 的事情。

学生和顾问在一组命名白板里写自由笔记（例如「暑期项目」「推荐信老师」「一起读的书」）。你的工作是从这些笔记里抽取出具体需要记住的事项——申请截止日期、决定日期、需要跟进的事、正在关闭的窗口。

你必须调用 extract_reminders 工具返回结构化结果，不要在工具之外写任何正文。

原则：
- 每一条提醒都必须基于笔记里真实写下的东西。如果某块白板只是随想、没有时间相关的内容，就可以返回 0 条。少而准，胜过多而虚。
- 如果笔记里出现了明确日期（比如"申请 4 月 15 日截止""deadline March 3, 2026"），请解析成 ISO 格式 YYYY-MM-DD。年份结合上下文——今天的日期会给你。
- 如果没有具体日期但隐含紧迫性（"要尽快决定""春天再看看"），date 填 null，并从以下三档里选 urgency：
    soon      — 大约 2 周内，或者出现了"ASAP""立刻""马上"这种措辞
    upcoming  — 1–3 个月内
    later     — 更远或开放时间
- title：简短，比如「Parsons 暑期强化营截止」「找 Ms. Lee 确认推荐信」。
- detail：1–2 句，把关键上下文写清楚（日期、链接、需要做什么决定）。允许中英混排，专有名词保留原文。
- source_board_id：提醒来源的白板 id，如果来自某块白板则必填。
- 最多返回 12 条，优先挑最紧迫的。

${MIXED_LANGUAGE_INPUT_NOTE}
${PROPER_NOUN_RULE}`;

const TOOL = {
  name: "extract_reminders",
  description:
    "从学生的想法白板里，抽取具体需要记住的事项（截止、跟进、待决定）。",
  input_schema: {
    type: "object" as const,
    required: ["reminders"],
    properties: {
      reminders: {
        type: "array" as const,
        items: {
          type: "object" as const,
          required: ["title", "detail", "urgency"],
          properties: {
            title: {
              type: "string" as const,
              description: "简短标题（中文为主，允许中英混排）",
            },
            detail: {
              type: "string" as const,
              description: "1–2 句上下文说明",
            },
            date: {
              type: ["string", "null"] as unknown as "string",
              description:
                "ISO 日期 YYYY-MM-DD（如果笔记里有明确日期），否则填 null。",
            },
            urgency: {
              type: "string" as const,
              enum: ["soon", "upcoming", "later"],
              description:
                "紧迫度档位：soon=2 周内；upcoming=1–3 个月；later=更远或开放。",
            },
            source_board_id: {
              type: ["string", "null"] as unknown as "string",
              description: "来源白板的 UUID。",
            },
          },
        },
      },
    },
  },
};

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n) + "…";
}

function normalizeUrgency(u: string): ReminderUrgency {
  if (u === "soon" || u === "upcoming" || u === "later") return u;
  return "upcoming";
}

function normalizeDate(d: string | null | undefined): string | null {
  if (!d || typeof d !== "string") return null;
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? d : null;
}

export async function POST(_req: Request) {
  const { profile, studentId } = await loadSession();
  if (!can.editIdeas(profile.role)) {
    return NextResponse.json({ error: "没有权限执行此操作" }, { status: 403 });
  }
  if (!studentId) {
    return NextResponse.json({ error: "没有关联的学生" }, { status: 400 });
  }

  const db = createSupabaseAdminClient();
  const { data: boardsData, error } = await db
    .from("idea_boards")
    .select("*")
    .eq("student_id", studentId)
    .order("order", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const boards = (boardsData ?? []) as IdeaBoard[];
  const hasContent = boards.some((b) => (b.content ?? "").trim().length > 0);
  if (!hasContent) {
    // Nothing to extract — clear any stale reminders and return empty.
    await db
      .from("growth_reminders")
      .upsert({
        student_id: studentId,
        reminders: [],
        generated_at: new Date().toISOString(),
        generated_by: profile.id,
      });
    return NextResponse.json({
      reminders: [],
      generated_at: new Date().toISOString(),
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const boardsBlock = boards
    .map((b) => {
      const header = `### ${b.title}${
        b.description ? ` — ${b.description}` : ""
      }（id: ${b.id}）`;
      const body = (b.content ?? "").trim() || "（空白）";
      return `${header}\n${truncate(body, 3000)}`;
    })
    .join("\n\n");

  const userPrompt = `今天是 ${today}。

下面是学生的想法白板。请抽取具体的提醒——截止、决定、跟进——然后调用 extract_reminders。

${boardsBlock}`;

  const client = getAnthropic();
  let toolInput: AIResponse;
  try {
    const resp = await client.messages.create({
      model: anthropicModel(),
      max_tokens: 2000,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: userPrompt }],
    });
    const toolBlock = resp.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      return NextResponse.json(
        { error: "AI 没有返回结构化结果，请稍后再试" },
        { status: 502 }
      );
    }
    toolInput = toolBlock.input as AIResponse;
  } catch (e) {
    return NextResponse.json(
      { error: `AI 请求失败：${(e as Error).message}` },
      { status: 502 }
    );
  }

  // Drop reminders that lost their source board, and normalize fields.
  const boardIds = new Set(boards.map((b) => b.id));
  const reminders: GrowthReminder[] = (toolInput.reminders ?? [])
    .filter((r) => r && typeof r.title === "string" && r.title.trim())
    .map((r) => ({
      id: crypto.randomUUID(),
      title: r.title.trim(),
      detail: (r.detail ?? "").trim(),
      date: normalizeDate(r.date),
      urgency: normalizeUrgency(r.urgency),
      source_board_id:
        r.source_board_id && boardIds.has(r.source_board_id)
          ? r.source_board_id
          : null,
    }))
    // Sort by date (soonest first), then by urgency bucket.
    .sort((a, b) => {
      if (a.date && b.date) return a.date.localeCompare(b.date);
      if (a.date) return -1;
      if (b.date) return 1;
      const rank = { soon: 0, upcoming: 1, later: 2 } as const;
      return rank[a.urgency] - rank[b.urgency];
    })
    .slice(0, 12);

  const generatedAt = new Date().toISOString();
  const { error: upsertErr } = await db.from("growth_reminders").upsert({
    student_id: studentId,
    reminders,
    generated_at: generatedAt,
    generated_by: profile.id,
  });
  if (upsertErr) {
    return NextResponse.json(
      { error: `保存失败：${upsertErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ reminders, generated_at: generatedAt });
}

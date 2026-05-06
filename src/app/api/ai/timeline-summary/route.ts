import { NextResponse } from "next/server";
import { loadSession } from "@/lib/session";
import { anthropicModel, getAnthropic } from "@/lib/anthropic";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtDate, fmtMonth } from "@/lib/dates";
import { trackById } from "@/lib/tracks";
import {
  PROPER_NOUN_RULE,
  SECOND_PERSON_VOICE,
} from "@/lib/ai-prompts";
import type {
  MonthlyGoal,
  TimelineItem,
  TimelineTrack,
  WeeklyTodo,
} from "@/types/db";

export const runtime = "nodejs";
export const maxDuration = 30;

// Two supported modes:
//   { track, thread }   – summarize a throughline across its full span.
//   { goalId }          – legacy: summarize one monthly goal (kept so
//                         existing call sites don't break).
interface Body {
  goalId?: string;
  track?: TimelineTrack;
  thread?: string;
  month?: string;
}

interface AIResponse {
  summary: string;
}

const SYSTEM_PROMPT = `你是一个升学规划操作系统里的叙事者。

当用户悬停在时间线的某条"主线"上时，你的任务是用 2–4 句话概括：这条工作线在讲什么、现在走到哪一步。${SECOND_PERSON_VOICE}

"主线"（throughline）是某个轨道里一个持续的、有名字的工作线。比如在"课外活动"里：「Parsons Summer School」「旧衣改造社团」。用户会提供给你：
- 这条主线所在的轨道
- 主线名字
- 这条主线下的所有时间线条目（区间与截止），以及状态
- 这条主线下的所有月度目标
- 与这些月度目标挂钩的周任务

写出"意义"，而不是任务堆砌：
- 先说这条主线本质上是为了什么（为什么重要）。
- 再说现在 TA 处在哪一步、接下来紧接着要做什么——用真实的条目和日期来落点。
- 如果有明显的下一个节点或截止，用它作为前进感的收束。
- 如果当前既无进行中也无即将开始，直接说"暂时处于静默期"，不要硬造活动。

${PROPER_NOUN_RULE}

调用 create_summary 工具返回结果，不要在工具之外写任何正文。`;

const SUMMARY_TOOL = {
  name: "create_summary",
  description: "对一条时间线主线，输出 2–4 句叙事性的摘要。",
  input_schema: {
    type: "object" as const,
    required: ["summary"],
    properties: {
      summary: {
        type: "string" as const,
        description:
          "面向学生本人的 2–4 句短叙事，不要使用列表或小标题。",
      },
    },
  },
};

function renderItems(items: TimelineItem[], todayISO: string): string {
  if (items.length === 0) return "- （暂无时间线条目）";
  return items
    .map((it) => {
      const dates =
        it.start_date === it.end_date
          ? `截止 ${fmtDate(it.start_date)}`
          : `${fmtDate(it.start_date)} → ${fmtDate(it.end_date)}`;
      const rel =
        it.end_date < todayISO
          ? "已过"
          : it.start_date > todayISO
            ? "即将开始"
            : "进行中";
      const statusLabel =
        it.status === "planned"
          ? "计划中"
          : it.status === "active"
            ? "进行中"
            : it.status === "done"
              ? "已完成"
              : it.status;
      return `- ${it.title} [${dates}，${rel}，状态=${statusLabel}]${
        it.description ? ` — ${it.description}` : ""
      }`;
    })
    .join("\n");
}

function renderGoals(goals: MonthlyGoal[]): string {
  if (goals.length === 0) return "- （暂无月度目标）";
  return goals
    .map(
      (g) =>
        `- ${fmtMonth(g.month)}：${g.title}${
          g.description ? ` — ${g.description}` : ""
        }`
    )
    .join("\n");
}

function renderTodos(todos: WeeklyTodo[]): string {
  if (todos.length === 0) return "- （暂无关联的周任务）";
  const statusLabel = (s: WeeklyTodo["status"]) =>
    s === "todo"
      ? "待办"
      : s === "in_progress"
        ? "进行中"
        : s === "done"
          ? "已完成"
          : s;
  return todos
    .map(
      (t) =>
        `- [${statusLabel(t.status)}] ${t.title}（${t.week_start} 所在周）${
          t.notes ? ` — ${t.notes}` : ""
        }`
    )
    .join("\n");
}

export async function POST(req: Request) {
  const { profile, studentId } = await loadSession();
  if (!studentId) {
    return NextResponse.json({ error: "没有关联的学生" }, { status: 400 });
  }
  if (profile.status !== "approved") {
    return NextResponse.json({ error: "账号未通过审批" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "请求数据格式不正确" }, { status: 400 });
  }

  const db = createSupabaseAdminClient();

  const isThreadMode = !!(body.track && body.thread && body.thread.trim());
  if (!isThreadMode && !body.goalId) {
    return NextResponse.json(
      { error: "需要提供 track + thread 或 goalId" },
      { status: 400 }
    );
  }

  let track: TimelineTrack;
  let threadName: string | null = null;
  let scopeLabel: string;
  let items: TimelineItem[] = [];
  let goals: MonthlyGoal[] = [];

  if (isThreadMode) {
    track = body.track!;
    threadName = body.thread!.trim();
    scopeLabel = `主线「${threadName}」`;

    const { data: itemsData, error: itemsErr } = await db
      .from("timeline_items")
      .select("*")
      .eq("student_id", studentId)
      .eq("track", track)
      .ilike("thread", threadName)
      .order("start_date", { ascending: true });
    if (itemsErr)
      return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    items = (itemsData ?? []) as TimelineItem[];

    const { data: goalsData, error: goalsErr } = await db
      .from("monthly_goals")
      .select("*")
      .eq("student_id", studentId)
      .eq("track", track)
      .ilike("thread", threadName)
      .order("month", { ascending: true });
    if (goalsErr)
      return NextResponse.json({ error: goalsErr.message }, { status: 500 });
    goals = (goalsData ?? []) as MonthlyGoal[];
  } else {
    // goalId fallback: summarize a single monthly goal.
    const { data: g } = await db
      .from("monthly_goals")
      .select("*")
      .eq("id", body.goalId!)
      .maybeSingle<MonthlyGoal>();
    if (!g) {
      return NextResponse.json({ error: "找不到这个目标" }, { status: 404 });
    }
    if (!g.track) {
      return NextResponse.json(
        { error: "这个目标还没有所属的轨道，无法生成摘要" },
        { status: 400 }
      );
    }
    track = g.track;
    scopeLabel = `月度目标「${g.title}」`;
    goals = [g];

    const monthStartISO = g.month.slice(0, 8) + "01";
    // Fetch items in the same track overlapping that month.
    const { data: itemsData } = await db
      .from("timeline_items")
      .select("*")
      .eq("student_id", studentId)
      .eq("track", track)
      .lt("start_date", monthStartNextISO(monthStartISO))
      .gte("end_date", monthStartISO)
      .order("start_date", { ascending: true });
    items = (itemsData ?? []) as TimelineItem[];
  }

  // Pull weekly todos linked to any of the goals in scope.
  let todos: WeeklyTodo[] = [];
  if (goals.length > 0) {
    const goalIds = goals.map((g) => g.id);
    const { data: todosData } = await db
      .from("weekly_todos")
      .select("*")
      .eq("student_id", studentId)
      .in("monthly_goal_id", goalIds)
      .order("week_start", { ascending: true });
    todos = (todosData ?? []) as WeeklyTodo[];
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  const t = trackById[track];

  const userPrompt = `轨道：${t.label}（${t.blurb}）
范围：${scopeLabel}
今天：${fmtDate(todayISO)}

时间线条目：
${renderItems(items, todayISO)}

月度目标：
${renderGoals(goals)}

关联的周任务：
${renderTodos(todos)}

现在调用 create_summary 工具返回摘要。`;

  const client = getAnthropic();
  let toolInput: AIResponse;
  try {
    const resp = await client.messages.create({
      model: anthropicModel(),
      max_tokens: 500,
      temperature: 0.6,
      system: SYSTEM_PROMPT,
      tools: [SUMMARY_TOOL],
      tool_choice: { type: "tool", name: SUMMARY_TOOL.name },
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

  if (typeof toolInput?.summary !== "string" || !toolInput.summary.trim()) {
    return NextResponse.json(
      { error: "AI 返回的结果缺少摘要", raw: toolInput },
      { status: 502 }
    );
  }

  return NextResponse.json({
    summary: toolInput.summary.trim(),
    counts: {
      items: items.length,
      goals: goals.length,
      todos: todos.length,
    },
  });
}

// Add one month to a YYYY-MM-01 string (naïve, enough for the lt() bound).
function monthStartNextISO(monthStartISO: string): string {
  const d = new Date(monthStartISO);
  d.setMonth(d.getMonth() + 1);
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-01"
  );
}

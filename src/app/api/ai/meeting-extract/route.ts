import { NextResponse } from "next/server";
import { loadSession } from "@/lib/session";
import { anthropicModel, getAnthropic } from "@/lib/anthropic";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";
import { fmtDate, fmtMonth, monthStart, toISO, today } from "@/lib/dates";
import { renderMeetingHistory } from "@/lib/meeting-history";
import { PROPER_NOUN_RULE } from "@/lib/ai-prompts";
import { trackById } from "@/lib/tracks";
import type {
  Meeting,
  MeetingSuggestionKind,
  MonthlyGoal,
  Stage,
  TimelineItem,
  TimelineTrack,
} from "@/types/db";

export const runtime = "nodejs";
export const maxDuration = 45;

// Input: { meetingId }
// The meeting must have notes saved. We load the student's context so the
// model can propose coherent adjustments, and return both a narrative
// summary and a list of suggestions for the counselor to approve.
interface Body {
  meetingId: string;
}

interface ToolInput {
  summary: string;
  key_updates: string[];
  suggestions: Array<{
    kind: MeetingSuggestionKind;
    title: string;
    rationale: string;
  }>;
}

const SYSTEM_PROMPT = `你是升学规划操作系统的"会谈后分析师"。顾问刚刚上传了一次会谈的原始笔记，你的任务是把它变成一份简短、可信的简报。

你必须产出三样东西：

1. summary——2–4 句话，描述这次会谈里真正发生了什么。第三人称写（"TA 讨论了……""学生决定了……"）。基于笔记，不要臆测。

2. key_updates——用字符串数组返回的几条"确切改变了计划状态"的事实。只保留笔记里明确说到的内容，跳过寒暄水分。

3. suggestions——0–6 条"对目标、任务、时间线或叙事线索"的调整建议，基于笔记里暴露出来的信号。每条是一次具体的改动，顾问可以去做。你不会真的去执行，顾问会逐条审阅、采纳或拒绝。

每条建议必须包含：
- kind：goal / task / timeline / narrative / other 之一
- title：简短的祈使句，例如「新增一个周任务：把 Common App 文书初稿发给老师」
- rationale：一句话，说明为什么这条是从这次笔记里自然延伸出来的。

如果笔记里并没有足够的依据去调整，就返回 suggestions: []。

${PROPER_NOUN_RULE}

调用 extract_notes 工具，不要在工具之外写任何正文。`;

const TOOL = {
  name: "extract_notes",
  description:
    "从一次会谈的笔记中产出摘要、关键更新与若干调整建议。",
  input_schema: {
    type: "object" as const,
    required: ["summary", "key_updates", "suggestions"],
    properties: {
      summary: {
        type: "string" as const,
        description: "2–4 句，第三人称叙述这次会谈里真正发生的事。",
      },
      key_updates: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "几条笔记里明确提到、会改变计划状态的事实。",
      },
      suggestions: {
        type: "array" as const,
        items: {
          type: "object" as const,
          required: ["kind", "title", "rationale"],
          properties: {
            kind: {
              type: "string" as const,
              enum: ["goal", "task", "timeline", "narrative", "other"],
              description:
                "建议类型：goal=目标；task=任务；timeline=时间线；narrative=叙事线索；other=其他。",
            },
            title: {
              type: "string" as const,
              description: "简短的祈使句（中文为主，允许中英混排）。",
            },
            rationale: {
              type: "string" as const,
              description: "一句话解释为什么这条从这次会谈里自然延伸。",
            },
          },
        },
      },
    },
  },
};

function trackLabel(t: TimelineTrack | null | undefined): string {
  if (!t) return "未分类";
  return trackById[t]?.label ?? t;
}

function fmtItems(items: TimelineItem[], todayISO: string): string {
  if (items.length === 0) return "- （暂无）";
  return items
    .slice(0, 20)
    .map((it) => {
      const when =
        it.start_date === it.end_date
          ? `截止 ${fmtDate(it.start_date)}`
          : `${fmtDate(it.start_date)} → ${fmtDate(it.end_date)}`;
      const rel =
        it.end_date < todayISO
          ? "已过"
          : it.start_date > todayISO
            ? "即将"
            : "进行中";
      return `- [${trackLabel(it.track)}] ${it.title}（${when}，${rel}）`;
    })
    .join("\n");
}

function fmtGoals(goals: MonthlyGoal[]): string {
  if (goals.length === 0) return "- （暂无）";
  return goals
    .map(
      (g) =>
        `- ${fmtMonth(g.month)} [${trackLabel(g.track)}] ${g.title}${
          g.description ? ` — ${g.description}` : ""
        }`
    )
    .join("\n");
}

export async function POST(req: Request) {
  const { profile, studentId } = await loadSession();
  if (!studentId)
    return NextResponse.json({ error: "没有关联的学生" }, { status: 400 });
  if (!can.manageMeetings(profile.role))
    return NextResponse.json({ error: "没有权限执行此操作" }, { status: 403 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "请求数据格式不正确" }, { status: 400 });
  }
  if (!body.meetingId)
    return NextResponse.json({ error: "缺少会谈 ID" }, { status: 400 });

  const db = createSupabaseAdminClient();
  const todayISO = toISO(today());
  const thisMonthISO = toISO(monthStart(today()));

  const [meetingRes, stageRes, goalsRes, itemsRes, historyRes] =
    await Promise.all([
    db
      .from("meetings")
      .select("*")
      .eq("id", body.meetingId)
      .eq("student_id", studentId)
      .maybeSingle<Meeting>(),
    db
      .from("stages")
      .select("*")
      .eq("student_id", studentId)
      .lte("start_date", todayISO)
      .gte("end_date", todayISO)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle<Stage>(),
    db
      .from("monthly_goals")
      .select("*")
      .eq("student_id", studentId)
      .gte("month", thisMonthISO)
      .order("month", { ascending: true })
      .order("order", { ascending: true }),
    db
      .from("timeline_items")
      .select("*")
      .eq("student_id", studentId)
      .gte("end_date", todayISO)
      .order("start_date", { ascending: true })
      .limit(40),
    // Prior completed meetings — history the model can build on.
    db
      .from("meetings")
      .select("*")
      .eq("student_id", studentId)
      .eq("status", "completed")
      .neq("id", body.meetingId)
      .order("scheduled_at", { ascending: true })
      .limit(40),
  ]);

  if (meetingRes.error)
    return NextResponse.json({ error: meetingRes.error.message }, { status: 500 });
  if (!meetingRes.data)
    return NextResponse.json({ error: "找不到这次会谈" }, { status: 404 });
  const meeting = meetingRes.data;
  if (!meeting.notes || !meeting.notes.trim())
    return NextResponse.json(
      { error: "这次会谈还没有任何笔记可以提炼" },
      { status: 400 }
    );

  const stage = stageRes.data;
  const goals = (goalsRes.data ?? []) as MonthlyGoal[];
  const items = (itemsRes.data ?? []) as TimelineItem[];
  const history = (historyRes.data ?? []) as Meeting[];

  const agendaBlock =
    meeting.agenda && meeting.agenda.length > 0
      ? meeting.agenda
          .map((a) => `- ${a.done ? "[x]" : "[ ]"} ${a.text}`)
          .join("\n")
      : "- （无）";

  const userPrompt = `今天：${fmtDate(todayISO)}
会谈：「${meeting.title}」${meeting.scheduled_at ? ` · ${new Date(meeting.scheduled_at).toLocaleString("zh-CN")}` : ""}

本次设定的议程：
${agendaBlock}

顾问的原始笔记：
"""
${meeting.notes}
"""

当前阶段：
${
  stage
    ? `- 「${stage.title}」（${fmtDate(stage.start_date)} → ${fmtDate(stage.end_date)}）\n  ${stage.why_it_matters ?? ""}`
    : "- （暂无进行中的阶段）"
}

即将到来的月度目标：
${fmtGoals(goals)}

即将到来的时间线条目与截止：
${fmtItems(items, todayISO)}

过往会谈记录（按时间顺序）——基于它把这次会谈连接到之前发生过的事；不要重复已经达成共识的建议：
${renderMeetingHistory(history, { limit: 10 })}

现在调用 extract_notes 工具。`;

  const client = getAnthropic();
  let parsed: ToolInput;
  try {
    const resp = await client.messages.create({
      model: anthropicModel(),
      max_tokens: 1600,
      temperature: 0.4,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: userPrompt }],
    });
    const tool = resp.content.find((b) => b.type === "tool_use");
    if (!tool || tool.type !== "tool_use")
      return NextResponse.json(
        { error: "AI 没有返回结构化结果，请稍后再试" },
        { status: 502 }
      );
    parsed = tool.input as ToolInput;
  } catch (e) {
    return NextResponse.json(
      { error: `AI 请求失败：${(e as Error).message}` },
      { status: 502 }
    );
  }

  const summary = (parsed.summary ?? "").trim();
  const keyUpdates = (parsed.key_updates ?? [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  const suggestions = (parsed.suggestions ?? [])
    .map((s) => ({
      kind: (s.kind as MeetingSuggestionKind) ?? "other",
      title: (s.title ?? "").trim(),
      rationale: (s.rationale ?? "").trim(),
    }))
    .filter((s) => s.title);

  return NextResponse.json({
    extract: { summary, key_updates: keyUpdates },
    suggestions,
  });
}

import { NextResponse } from "next/server";
import { loadSession } from "@/lib/session";
import { anthropicModel, getAnthropic } from "@/lib/anthropic";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";
import { fmtDate, fmtMonth, monthStart, toISO, today } from "@/lib/dates";
import { renderMeetingHistory } from "@/lib/meeting-history";
import {
  PROPER_NOUN_RULE,
} from "@/lib/ai-prompts";
import { trackById } from "@/lib/tracks";
import type {
  Meeting,
  MonthlyGoal,
  Stage,
  TimelineItem,
  TimelineTrack,
  WeeklyTodo,
} from "@/types/db";

export const runtime = "nodejs";
export const maxDuration = 30;

// Input: { meetingId }.  The counselor wants a suggested agenda for the
// meeting. We pull all relevant context (stage, active goals, upcoming
// deadlines, recent todos, student's requested topic) and ask Claude to
// produce a short bulleted agenda.
interface Body {
  meetingId: string;
}

interface AIResponse {
  items: string[];
}

const SYSTEM_PROMPT = `你正在为一位正在走升学申请的高中生，共建一次 1:1 会谈的议程。你的议程要帮顾问把这次会谈对焦到"此刻真正重要的事"。

写一个 3–6 条的简短议程。每一条是一个具体的谈话切口：
- 锚定在学生当前阶段与近期截止日期上
- 在合适的时候引用正在进行的月度目标或主线
- 基于之前会谈中已经走过的地方——绝对不要重复已经走过的老路
- 给学生自己的问题留出空间
- 措辞像一个"谈什么"的话题，而不是"让学生做什么"的任务

不要写空洞的寒暄（"开场""总结"）。每一条都要有它留下的理由。

如果学生申请这次会谈时带了具体主题，第一条必须围绕那个主题。

${PROPER_NOUN_RULE}

调用 create_agenda 工具返回结果，不要在工具之外写任何正文。`;

const AGENDA_TOOL = {
  name: "create_agenda",
  description: "产出一个包含 3–6 条具体议程项的数组。",
  input_schema: {
    type: "object" as const,
    required: ["items"],
    properties: {
      items: {
        type: "array" as const,
        minItems: 3,
        maxItems: 6,
        items: {
          type: "string" as const,
          description: "单条议程项，一行文字。",
        },
      },
    },
  },
};

function trackLabel(t: TimelineTrack | null | undefined): string {
  if (!t) return "未分类";
  return trackById[t]?.label ?? t;
}

function todoStatusLabel(s: WeeklyTodo["status"]): string {
  return s === "todo"
    ? "待办"
    : s === "in_progress"
      ? "进行中"
      : s === "done"
        ? "已完成"
        : s;
}

function line(items: TimelineItem[], todayISO: string): string {
  if (items.length === 0) return "- （暂无）";
  return items
    .slice(0, 16)
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

function goalLine(goals: MonthlyGoal[]): string {
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

function todoLine(todos: WeeklyTodo[]): string {
  if (todos.length === 0) return "- （暂无）";
  return todos
    .slice(0, 20)
    .map(
      (t) =>
        `- [${todoStatusLabel(t.status)}] ${t.title}（${t.week_start} 所在周）`
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
  const monthISO = toISO(monthStart(today()));

  const [
    meetingRes,
    stageRes,
    goalsRes,
    upcomingRes,
    activeRes,
    todosRes,
    historyRes,
  ] = await Promise.all([
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
        .eq("month", monthISO)
        .order("order", { ascending: true }),
      // Upcoming (next ~3 months) + deadlines
      db
        .from("timeline_items")
        .select("*")
        .eq("student_id", studentId)
        .gte("end_date", todayISO)
        .order("start_date", { ascending: true })
        .limit(30),
      // Currently active
      db
        .from("timeline_items")
        .select("*")
        .eq("student_id", studentId)
        .lte("start_date", todayISO)
        .gte("end_date", todayISO),
      db
        .from("weekly_todos")
        .select("*")
        .eq("student_id", studentId)
        .gte("week_start", toISO(new Date(Date.now() - 14 * 86400e3)))
        .order("week_start", { ascending: true }),
      // Everything completed so far, so the agenda avoids repeating
      // ground already covered.
      db
        .from("meetings")
        .select("*")
        .eq("student_id", studentId)
        .eq("status", "completed")
        .order("scheduled_at", { ascending: true })
        .limit(40),
    ]);

  if (meetingRes.error)
    return NextResponse.json({ error: meetingRes.error.message }, { status: 500 });
  if (!meetingRes.data)
    return NextResponse.json({ error: "找不到这次会谈" }, { status: 404 });

  const meeting = meetingRes.data;
  const stage = stageRes.data;
  const goals = (goalsRes.data ?? []) as MonthlyGoal[];
  const upcoming = (upcomingRes.data ?? []) as TimelineItem[];
  const active = (activeRes.data ?? []) as TimelineItem[];
  const todos = (todosRes.data ?? []) as WeeklyTodo[];
  const history = (historyRes.data ?? []) as Meeting[];

  const userPrompt = `今天：${fmtDate(todayISO)}
会谈：「${meeting.title}」${meeting.scheduled_at ? `，计划时间 ${new Date(meeting.scheduled_at).toLocaleString("zh-CN")}` : "（时间尚未确定）"}
${meeting.request_topic ? `学生申请时提到的主题：${meeting.request_topic}\n` : ""}

当前阶段：
${
  stage
    ? `- 「${stage.title}」（${fmtDate(stage.start_date)} → ${fmtDate(stage.end_date)}）\n  ${stage.why_it_matters ?? ""}`
    : "- （暂无进行中的阶段）"
}

${fmtMonth(monthISO)} 的月度目标：
${goalLine(goals)}

当前进行中的时间线条目：
${line(active, todayISO)}

即将来临的时间线条目与截止：
${line(upcoming, todayISO)}

近两周的周任务：
${todoLine(todos)}

过往会谈记录（按时间顺序）——请基于它避开已经谈过的地方，并在已做的决定上继续往前：
${renderMeetingHistory(history, { limit: 10 })}

现在调用 create_agenda 工具。`;

  const client = getAnthropic();
  let parsed: AIResponse;
  try {
    const resp = await client.messages.create({
      model: anthropicModel(),
      max_tokens: 700,
      temperature: 0.5,
      system: SYSTEM_PROMPT,
      tools: [AGENDA_TOOL],
      tool_choice: { type: "tool", name: AGENDA_TOOL.name },
      messages: [{ role: "user", content: userPrompt }],
    });
    const tool = resp.content.find((b) => b.type === "tool_use");
    if (!tool || tool.type !== "tool_use")
      return NextResponse.json(
        { error: "AI 没有返回结构化结果，请稍后再试" },
        { status: 502 }
      );
    parsed = tool.input as AIResponse;
  } catch (e) {
    return NextResponse.json(
      { error: `AI 请求失败：${(e as Error).message}` },
      { status: 502 }
    );
  }

  const items = (parsed.items ?? [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);

  return NextResponse.json({ items });
}

import { NextResponse } from "next/server";
import { loadSession } from "@/lib/session";
import { anthropicModel, getAnthropic } from "@/lib/anthropic";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";
import {
  MIXED_LANGUAGE_INPUT_NOTE,
  PROPER_NOUN_RULE,
  SECOND_PERSON_VOICE,
} from "@/lib/ai-prompts";
import type { Activity, NarrativeEntry } from "@/types/db";

export const runtime = "nodejs";
export const maxDuration = 45;

interface Body {
  activityId: string;
}

interface AIResponse {
  summary: string;
}

const SYSTEM_PROMPT = `你是一位教练，帮学生把某个活动放进 TA 更大的故事里。

给定这个活动，以及学生正在构建的叙事线索，请写出 2–3 句紧凑的"叙事提炼"：点出贯穿其中的主线，以及最真实的"为什么"。${SECOND_PERSON_VOICE}现在时，不要空洞的形容词（如"了不起""令人印象深刻"）。严格基于输入，不要编造细节。如果这个活动本身很日常，就诚实说小一点，而不是硬拔高。

${MIXED_LANGUAGE_INPUT_NOTE}
${PROPER_NOUN_RULE}

你必须调用 write_activity_summary 工具返回结果。`;

const TOOL = {
  name: "write_activity_summary",
  description: "对这个活动，输出 2–3 句叙事性提炼。",
  input_schema: {
    type: "object" as const,
    required: ["summary"],
    properties: {
      summary: {
        type: "string" as const,
        description: "2–3 句，第二人称，严格基于输入。",
      },
    },
  },
};

function truncate(s: string | null | undefined, n: number) {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n) + "…";
}

export async function POST(req: Request) {
  const { profile, studentId } = await loadSession();
  if (!can.editActivities(profile.role)) {
    return NextResponse.json({ error: "没有权限执行此操作" }, { status: 403 });
  }
  if (!studentId) {
    return NextResponse.json({ error: "没有关联的学生" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "请求数据格式不正确" }, { status: 400 });
  }
  if (!body.activityId) {
    return NextResponse.json(
      { error: "缺少活动 ID" },
      { status: 400 }
    );
  }

  const db = createSupabaseAdminClient();
  const [activityRes, narrativeRes] = await Promise.all([
    db
      .from("activities")
      .select("*")
      .eq("id", body.activityId)
      .eq("student_id", studentId)
      .maybeSingle<Activity>(),
    db
      .from("narrative_entries")
      .select("*")
      .eq("student_id", studentId)
      .in("kind", ["theme", "value", "direction"]) // most useful framing signals
      .order("created_at", { ascending: true }),
  ]);

  if (activityRes.error || !activityRes.data) {
    return NextResponse.json(
      { error: "找不到这个活动" },
      { status: 404 }
    );
  }
  const activity = activityRes.data;
  const narrative = (narrativeRes.data ?? []) as NarrativeEntry[];

  const kindLabel = (k: string) =>
    k === "theme"
      ? "主题"
      : k === "value"
        ? "价值观"
        : k === "story"
          ? "故事节点"
          : k === "growth_area"
            ? "成长方向"
            : k === "direction"
              ? "前行方向"
              : k;

  const userPrompt = `活动：
- 标题：${activity.title}
- 角色：${activity.role_label || "未填写"}
- 做了什么：${truncate(activity.description, 600) || "（无）"}
- 为什么做（动机）：${truncate(activity.motivation, 600) || "（无）"}
- 学到什么：${truncate(activity.learning_outcomes, 600) || "（无）"}
- 学生自己写的"与叙事的联系"：${truncate(activity.narrative_relevance, 600) || "（无）"}

学生当前的叙事线索：
${
  narrative.length
    ? narrative
        .map(
          (n) =>
            `- [${kindLabel(n.kind)}] ${n.title}${
              n.content ? ` — ${truncate(n.content, 300)}` : ""
            }`
        )
        .join("\n")
    : "（暂时还没有——尤其要小心，不要凭空编造主题）"
}

现在调用 write_activity_summary 工具。`;

  const client = getAnthropic();
  let toolInput: AIResponse;
  try {
    const resp = await client.messages.create({
      model: anthropicModel(),
      max_tokens: 500,
      temperature: 0.6,
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

  const summary = (toolInput.summary || "").trim();
  if (!summary) {
    return NextResponse.json(
      { error: "AI 返回的结果为空" },
      { status: 502 }
    );
  }

  await db
    .from("activities")
    .update({ ai_summary: summary })
    .eq("id", activity.id)
    .eq("student_id", studentId);

  return NextResponse.json({ summary });
}

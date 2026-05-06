import { NextResponse } from "next/server";
import { loadSession } from "@/lib/session";
import { anthropicModel, getAnthropic } from "@/lib/anthropic";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";
import { setReflectionAISummary } from "@/app/actions/reflections";
import {
  MIXED_LANGUAGE_INPUT_NOTE,
  PROPER_NOUN_RULE,
  SECOND_PERSON_VOICE,
} from "@/lib/ai-prompts";
import type { MeetingReflection } from "@/types/db";

export const runtime = "nodejs";
export const maxDuration = 30;

interface Body {
  reflectionId: string;
}

interface ToolInput {
  summary: string;
}

const SYSTEM_PROMPT = `你正在帮一位高中生从 TA 自己的反思中提炼意义。这些文字是私密的、私人的——请温柔对待。

写一小段（2–3 句），捕捉 TA 自己的语气与刚刚注意到的东西。${SECOND_PERSON_VOICE}不要把反思改写成任务清单。不要给建议。你是一面镜子，不是教练。

${MIXED_LANGUAGE_INPUT_NOTE}
${PROPER_NOUN_RULE}

调用 create_summary 工具返回结果。`;

const TOOL = {
  name: "create_summary",
  description: "对学生的反思，输出 2–3 句叙事性的摘要。",
  input_schema: {
    type: "object" as const,
    required: ["summary"],
    properties: { summary: { type: "string" as const } },
  },
};

export async function POST(req: Request) {
  const { profile, studentId } = await loadSession();
  if (!studentId)
    return NextResponse.json({ error: "没有关联的学生" }, { status: 400 });
  if (!can.writeReflection(profile.role))
    return NextResponse.json({ error: "没有权限执行此操作" }, { status: 403 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "请求数据格式不正确" }, { status: 400 });
  }
  if (!body.reflectionId)
    return NextResponse.json(
      { error: "缺少反思 ID" },
      { status: 400 }
    );

  const db = createSupabaseAdminClient();
  const { data: reflection, error } = await db
    .from("meeting_reflections")
    .select("*")
    .eq("id", body.reflectionId)
    .eq("student_id", studentId)
    .maybeSingle<MeetingReflection>();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!reflection)
    return NextResponse.json({ error: "找不到这条反思" }, { status: 404 });

  const client = getAnthropic();
  let parsed: ToolInput;
  try {
    const resp = await client.messages.create({
      model: anthropicModel(),
      max_tokens: 400,
      temperature: 0.6,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [
        {
          role: "user",
          content: `学生的反思：\n"""\n${reflection.content}\n"""\n\n现在调用 create_summary 工具。`,
        },
      ],
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
  if (!summary)
    return NextResponse.json(
      { error: "AI 返回的摘要为空" },
      { status: 502 }
    );

  await setReflectionAISummary(reflection.id, summary);
  return NextResponse.json({ summary });
}

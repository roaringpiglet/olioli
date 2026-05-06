import { NextResponse } from "next/server";
import { loadSession } from "@/lib/session";
import { anthropicModel, getAnthropic } from "@/lib/anthropic";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";
import type {
  Activity,
  GrowthArea,
  JournalEntry,
  MeetingReflection,
  NarrativeDirection,
  NarrativeEntry,
  Recommendation,
  ThemeInsight,
  ValuePattern,
} from "@/types/db";
import {
  MIXED_LANGUAGE_INPUT_NOTE,
  PROPER_NOUN_RULE,
  SECOND_PERSON_VOICE,
} from "@/lib/ai-prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

interface AIResponse {
  headline: string;
  emerging_themes: ThemeInsight[];
  value_patterns: ValuePattern[];
  narrative_directions: NarrativeDirection[];
  growth_areas: GrowthArea[];
  recommendations: Recommendation[];
}

const SYSTEM_PROMPT = `你是一位细腻的教练，正在综合这位高中生"正在成为谁"——在 TA 准备升学的这段时间里。

你的任务是读取 TA 的原始输入——正在一起构建的叙事线索、私人日志、会谈反思，以及活动档案——然后产出一份连贯、有证据支撑的综合洞察。

你必须调用 create_growth_insights 工具返回结构化结果，不要在工具之外写任何正文。

原则：
- 每一条洞察都必须基于真实输入。绝对不要编造 TA 没说过的兴趣、事件或信念。
- 隐私：日志是学生私人的内容。写的时候要用"综合"的方式表达，不要原文摘抄，也不要让学生在被顾问读到时感到难堪。可以引用主题，不能引用原句。
- 要具体。"有好奇心"太弱；"总是顺着一些奇怪的问题走进自己做的小实验（发酵日志、二手夹克改造）"才够。
- 要诚实。如果 TA 说在乎的事和真正做的事之间存在张力，用温和的方式把它放进"值得成长的方向"里。
- 推荐要像一个真的教练。2–4 条具体行动。其中至少一条是具体的书或文章（带作者）。其他可以是练习（比如"每周录 10 分钟语音反思"）、对话（"问问妈妈当年移民的故事"），或小项目（"做一个 4 周的小实验，记录每一次进入心流的瞬间"）。
- 叙述学生故事的部分用第二人称。${SECOND_PERSON_VOICE.replace("以第二人称直接对学生说话，", "")}句子尽量短。

${MIXED_LANGUAGE_INPUT_NOTE}
${PROPER_NOUN_RULE}

字段（全部必填，即使数组较短）：
- headline：一句话，抓住这位学生此时的核心主线。
- emerging_themes：2–5 条正在浮现的主题。
- value_patterns：2–5 条价值观。"value"是一个词，"signal"说明在输入里是什么指向它。
- narrative_directions：2–4 条叙事方向——TA 似乎正在走向哪里。
- growth_areas：2–4 条诚实的成长边界，用"发展课题"来写，不是批评。
- recommendations：2–5 条具体的下一步行动，kind 必须是 {book, practice, conversation, project, other} 之一。`;

const TOOL = {
  name: "create_growth_insights",
  description:
    "基于学生的叙事线索、日志、反思与活动，综合 TA 正在成为谁。",
  input_schema: {
    type: "object" as const,
    required: [
      "headline",
      "emerging_themes",
      "value_patterns",
      "narrative_directions",
      "growth_areas",
      "recommendations",
    ],
    properties: {
      headline: { type: "string" as const },
      emerging_themes: {
        type: "array" as const,
        minItems: 2,
        items: {
          type: "object" as const,
          required: ["title", "evidence"],
          properties: {
            title: { type: "string" as const },
            evidence: {
              type: "string" as const,
              description:
                "1–2 句，用真实输入（转述，不要逐字引用）支撑这个主题。",
            },
          },
        },
      },
      value_patterns: {
        type: "array" as const,
        minItems: 2,
        items: {
          type: "object" as const,
          required: ["value", "signal"],
          properties: {
            value: { type: "string" as const },
            signal: { type: "string" as const },
          },
        },
      },
      narrative_directions: {
        type: "array" as const,
        minItems: 2,
        items: {
          type: "object" as const,
          required: ["direction", "why"],
          properties: {
            direction: { type: "string" as const },
            why: { type: "string" as const },
          },
        },
      },
      growth_areas: {
        type: "array" as const,
        minItems: 2,
        items: {
          type: "object" as const,
          required: ["area", "why"],
          properties: {
            area: { type: "string" as const },
            why: { type: "string" as const },
          },
        },
      },
      recommendations: {
        type: "array" as const,
        minItems: 2,
        items: {
          type: "object" as const,
          required: ["action", "kind", "detail"],
          properties: {
            action: {
              type: "string" as const,
              description: "简短的祈使句，例如「读《Designing Your Life》」。",
            },
            kind: {
              type: "string" as const,
              enum: ["book", "practice", "conversation", "project", "other"],
              description:
                "行动类型：book=阅读；practice=练习；conversation=对话；project=小项目；other=其他。",
            },
            detail: {
              type: "string" as const,
              description:
                "1–3 句，说明这条行动为什么贴合这个学生，和你在输入里看到的证据挂钩。",
            },
          },
        },
      },
    },
  },
};

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n) + "…";
}

export async function POST(_req: Request) {
  const { profile, studentId } = await loadSession();
  if (!can.refreshGrowthInsights(profile.role)) {
    return NextResponse.json({ error: "没有权限执行此操作" }, { status: 403 });
  }
  if (!studentId) {
    return NextResponse.json({ error: "没有关联的学生" }, { status: 400 });
  }

  const db = createSupabaseAdminClient();

  const [narrativeRes, journalRes, reflectionsRes, activitiesRes] =
    await Promise.all([
      db
        .from("narrative_entries")
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: true }),
      db
        .from("journal_entries")
        .select("*")
        .eq("student_id", studentId)
        .order("entry_date", { ascending: false })
        .limit(60),
      db
        .from("meeting_reflections")
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(40),
      db
        .from("activities")
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: true }),
    ]);

  const narrative = (narrativeRes.data ?? []) as NarrativeEntry[];
  const journal = (journalRes.data ?? []) as JournalEntry[];
  const reflections = (reflectionsRes.data ?? []) as MeetingReflection[];
  const activities = (activitiesRes.data ?? []) as Activity[];

  const empty =
    narrative.length === 0 &&
    journal.length === 0 &&
    reflections.length === 0 &&
    activities.length === 0;
  if (empty) {
    return NextResponse.json(
      {
        error:
          "暂时还没有可综合的内容——请先至少添加一条叙事记录、一篇日志、一次反思或一个活动。",
      },
      { status: 400 }
    );
  }

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

  const narrativeBlock = narrative.length
    ? narrative
        .map(
          (n) =>
            `- [${kindLabel(n.kind)}] ${n.title}${
              n.content ? ` — ${truncate(n.content, 500)}` : ""
            }`
        )
        .join("\n")
    : "（暂无）";

  const journalBlock = journal.length
    ? journal
        .map((j) => `- ${j.entry_date}：${truncate(j.content, 600)}`)
        .join("\n")
    : "（暂无）";

  const reflectionBlock = reflections.length
    ? reflections
        .map(
          (r) =>
            `- ${r.created_at.slice(0, 10)}${
              r.ai_summary ? `【摘要】${r.ai_summary}` : ""
            } ${r.content ? `— ${truncate(r.content, 400)}` : ""}`
        )
        .join("\n")
    : "（暂无）";

  const activityBlock = activities.length
    ? activities
        .map((a) => {
          const lines: string[] = [`- ${a.title}`];
          if (a.role_label) lines.push(`  角色：${a.role_label}`);
          if (a.description)
            lines.push(`  做了什么：${truncate(a.description, 300)}`);
          if (a.motivation)
            lines.push(`  动机：${truncate(a.motivation, 300)}`);
          if (a.learning_outcomes)
            lines.push(`  学到什么：${truncate(a.learning_outcomes, 300)}`);
          if (a.narrative_relevance)
            lines.push(
              `  与叙事的联系：${truncate(a.narrative_relevance, 300)}`
            );
          return lines.join("\n");
        })
        .join("\n")
    : "（暂无）";

  const userPrompt = `学生的原始输入（要转述，不要把日志原文逐字放进输出）：

## 学生与顾问一起在构建的叙事线索
${narrativeBlock}

## 私人日志（仅内部用于捕捉规律——不要原样暴露任何一句）
${journalBlock}

## 会谈反思
${reflectionBlock}

## 活动档案
${activityBlock}

现在调用 create_growth_insights 工具。`;

  const client = getAnthropic();
  let toolInput: AIResponse;
  try {
    const resp = await client.messages.create({
      model: anthropicModel(),
      max_tokens: 3000,
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

  // Persist so other roles see the same synthesis until the next refresh.
  const { error: upsertErr } = await db.from("growth_insights").upsert({
    student_id: studentId,
    headline: toolInput.headline ?? null,
    emerging_themes: toolInput.emerging_themes ?? [],
    value_patterns: toolInput.value_patterns ?? [],
    narrative_directions: toolInput.narrative_directions ?? [],
    growth_areas: toolInput.growth_areas ?? [],
    recommendations: toolInput.recommendations ?? [],
    generated_at: new Date().toISOString(),
    generated_by: profile.id,
  });
  if (upsertErr) {
    return NextResponse.json(
      { error: `保存失败：${upsertErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    headline: toolInput.headline,
    emerging_themes: toolInput.emerging_themes,
    value_patterns: toolInput.value_patterns,
    narrative_directions: toolInput.narrative_directions,
    growth_areas: toolInput.growth_areas,
    recommendations: toolInput.recommendations,
    generated_at: new Date().toISOString(),
  });
}

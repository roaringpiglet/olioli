import { NextResponse } from "next/server";
import { loadSession } from "@/lib/session";
import { anthropicModel, getAnthropic } from "@/lib/anthropic";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";
import { fmtDate } from "@/lib/dates";
import { renderMeetingHistory } from "@/lib/meeting-history";
import {
  PROPER_NOUN_RULE,
  SECOND_PERSON_VOICE,
} from "@/lib/ai-prompts";
import type { FocusArea, Meeting } from "@/types/db";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  startDate: string;
  endDate: string;
  studentContext?: string;
  gradeLevel?: string;
  // The user's current draft — title / why-it-matters / per-area notes.
  // The AI is asked to *polish* these into clear, consistent prose, not
  // invent new content. Optional so the first-time path (everything empty)
  // can still get a starter overview.
  draftTitle?: string;
  draftWhyItMatters?: string;
  draftFocusAreas?: FocusArea[];
}

// We ask the AI for *flat* string fields per focus area instead of a
// nested array. Claude is far more reliable at top-level string fields
// than at nested arrays of objects whose values contain Chinese quotes
// — when the schema is nested it sometimes serializes the whole array
// as a JSON-encoded string with broken escapes. Flat = bulletproof.
interface AIResponse {
  title: string;
  why_it_matters: string;
  note_academic: string;
  note_extracurriculars: string;
  note_testing: string;
  note_portfolio: string;
  note_personal: string;
  note_application: string;
}

const AREA_LABEL: Array<{ key: keyof AIResponse; area: string }> = [
  { key: "note_academic", area: "学术" },
  { key: "note_extracurriculars", area: "课外活动" },
  { key: "note_testing", area: "标化考试" },
  { key: "note_portfolio", area: "作品集" },
  { key: "note_personal", area: "个人成长" },
  { key: "note_application", area: "申请准备" },
];

const SYSTEM_PROMPT = `你是一个升学规划操作系统的策略大脑，服务于美国 / 北美语境下的一位顾问、一名学生和 TA 的家长。

你的工作是把顾问写下的"阶段草稿"整理成一份清楚、有条理、好读的阶段说明——不是从零开始另写一份。

【最重要的原则——绝不无中生有】
- 草稿里写过的具体事实（学校、课程、考试、项目、人名、日期、动作、场景），必须**完整保留**，不能删除、概括掉或换成更"漂亮"的泛词。
- 草稿里没有的具体事实，**绝对不要**编造：不要新增学校名、考试名、分数、活动、奖项、时间点。
- 如果某个方向的 note 草稿是空的，你可以基于 whyItMatters 与其它已写内容，给一句**通用、不带具体细节**的策略性提醒；不能凭空想象出 TA 在做什么。
- 如果整个草稿几乎全空（only 日期），就说明这是"开局"，用最克制的方式起一个朴素框架，明确写出"待补充"的方向，等顾问继续填。

【整理时要做的事】
- 把零散口语化的草稿改成简练书面的中文（允许保留中英混排的专有名词）。
- 把同一段里重复的表达去掉。
- 把含糊的指代讲清楚（比如"那次活动"→ 草稿里出现过的具体名字）。
- 把逻辑顺序理顺：先说"为什么"，再说"具体落点"。
- 句子尽量短；信息密度高；不要煽情、不要空洞形容词（像"了不起""全方位"这种）。

${SECOND_PERSON_VOICE.replace("以第二人称直接对学生说话，", "如果在写学生本人的部分，可以用第二人称；写策略性总览时第三人称也行。")}
${PROPER_NOUN_RULE}

你必须调用 create_stage_overview 工具返回结构化结果，不要在工具之外写任何正文。

【字段输出规则】
- "title"：如果草稿里给了标题，保留它的核心意思（可以润色措辞，但不要换主题）。如果草稿没有标题，根据日期窗口与内容起一个简短有辨识度的，例如「10 年级春季——探索与打底」。
- "why_it_matters"：2–4 句完整段落，说明这一阶段在学生长期弧线中的意义。如果草稿写过对应内容，就以草稿为骨干来精简、润色；不要把草稿替换成不相关的"标准说辞"。

【六个方向的 note 字段——必须是 bullet 列表】
- 字段名：note_academic / note_extracurriculars / note_testing / note_portfolio / note_personal / note_application。
- 每一项必须是 2–5 条 bullet，**每条独占一行**，行首以 \`- \`（一个英文短横 + 一个空格）开头。
- 每条 bullet 8–25 个字左右，短而具体，便于扫读。
- bullet 之间不加空行；不要再加额外的标题、引言、总结句——直接列。
- 如果该方向草稿不空：以草稿为唯一依据来整理；可以重排顺序、合并相似项、改成 bullet 形式；不能新增 / 删除该方向已经写到的具体事实（学校、考试、活动名、动作、日期）。
- 如果草稿是空的：返回 1–2 条通用、不含具体名字 / 分数的策略提醒，最后再加一条 \`- 暂未填写细节，待补充\`。

举例（这是格式示范，不是内容范本）：
\`\`\`
- 保持 / 提升核心课程 GPA
- 评估 11 年级课程负担，预判 workload
- 标化与学术之间的优先级，本学期内排好
\`\`\`

【极其重要——关于引号】
- 任何字段的文本里**不要使用 ASCII 双引号 \`"\`**——容易把工具调用的 JSON 转义打乱。
- 需要强调或引用时，请用中文「」或单引号 \`'\`。`;

const STAGE_TOOL = {
  name: "create_stage_overview",
  description:
    "输出一份策略性的阶段总览。每个方向独立一个字段，便于稳定返回。",
  input_schema: {
    type: "object" as const,
    required: [
      "title",
      "why_it_matters",
      "note_academic",
      "note_extracurriculars",
      "note_testing",
      "note_portfolio",
      "note_personal",
      "note_application",
    ],
    properties: {
      title: {
        type: "string" as const,
        description: "简短的阶段标题，例如「10 年级春季——探索与打底」",
      },
      why_it_matters: {
        type: "string" as const,
        description: "2–4 句，说明这一阶段在学生长期弧线中的意义。",
      },
      note_academic: {
        type: "string" as const,
        description:
          "「学术」方向 2–5 条 bullet，每条独占一行、以 '- ' 开头。不要 ASCII 双引号。",
      },
      note_extracurriculars: {
        type: "string" as const,
        description:
          "「课外活动」方向 2–5 条 bullet，每条独占一行、以 '- ' 开头。不要 ASCII 双引号。",
      },
      note_testing: {
        type: "string" as const,
        description:
          "「标化考试」方向 2–5 条 bullet，每条独占一行、以 '- ' 开头。不要 ASCII 双引号。",
      },
      note_portfolio: {
        type: "string" as const,
        description:
          "「作品集」方向 2–5 条 bullet，每条独占一行、以 '- ' 开头。不要 ASCII 双引号。",
      },
      note_personal: {
        type: "string" as const,
        description:
          "「个人成长」方向 2–5 条 bullet，每条独占一行、以 '- ' 开头。不要 ASCII 双引号。",
      },
      note_application: {
        type: "string" as const,
        description:
          "「申请准备」方向 2–5 条 bullet，每条独占一行、以 '- ' 开头。不要 ASCII 双引号。",
      },
    },
  },
};

export async function POST(req: Request) {
  const { profile, studentId } = await loadSession();
  if (!can.editStage(profile.role)) {
    return NextResponse.json({ error: "没有权限执行此操作" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "请求数据格式不正确" }, { status: 400 });
  }

  if (!body.startDate || !body.endDate) {
    return NextResponse.json(
      { error: "需要提供开始日期与结束日期" },
      { status: 400 }
    );
  }

  // Pull any completed meetings so the overview reflects what the
  // counselor and student have actually worked through together so far.
  let history: Meeting[] = [];
  if (studentId) {
    const db = createSupabaseAdminClient();
    const { data } = await db
      .from("meetings")
      .select("*")
      .eq("student_id", studentId)
      .eq("status", "completed")
      .order("scheduled_at", { ascending: true })
      .limit(40);
    history = (data ?? []) as Meeting[];
  }

  const client = getAnthropic();

  const draftAreas = body.draftFocusAreas ?? [];
  // Render every focus area, even ones the user hasn't filled, so the AI
  // can see exactly which slots are blank and not invent content for them.
  const formatDraftAreas = () => {
    const ORDER = [
      "学术",
      "课外活动",
      "标化考试",
      "作品集",
      "个人成长",
      "申请准备",
    ];
    const lines = ORDER.map((name) => {
      const found = draftAreas.find((a) => a.area === name);
      const note = found?.note?.trim();
      return note
        ? `- ${name}：${note}`
        : `- ${name}：（草稿为空）`;
    });
    // Tack on any extra areas the user added that aren't in the canonical 6.
    const extras = draftAreas.filter((a) => !ORDER.includes(a.area));
    for (const a of extras) {
      lines.push(`- ${a.area || "（未命名方向）"}：${a.note?.trim() || "（草稿为空）"}`);
    }
    return lines.join("\n");
  };

  const draftTitle = body.draftTitle?.trim();
  const draftWhy = body.draftWhyItMatters?.trim();
  const anyDraft =
    !!draftTitle ||
    !!draftWhy ||
    draftAreas.some((a) => a.note?.trim()) ||
    !!body.studentContext?.trim();

  const userPrompt = `阶段窗口：${fmtDate(body.startDate)} → ${fmtDate(
    body.endDate
  )}
年级 / 季节线索：${body.gradeLevel || "未指定"}

【顾问写下的草稿——这是你整理的唯一基础】
${
  anyDraft
    ? `- 标题草稿：${draftTitle || "（空）"}
- "为什么这个阶段重要"草稿：${draftWhy || "（空）"}
- 重点方向草稿（按当前顺序）：
${formatDraftAreas()}`
    : "（顾问还没写任何草稿——这是这位学生的第一次。请只产出最朴素的开局框架，明确写「待补充」。）"
}

【可选的额外上下文】
${body.studentContext?.trim() || "（无）"}

【过往会谈记录】仅作为背景参考，帮助你判断哪些是真实发生过的、哪些是没出现过的——绝对不要把这里的内容直接搬进 note：
${renderMeetingHistory(history, { limit: 12 })}

现在调用 create_stage_overview 工具，把上述草稿整理成清楚、有条理、保真的阶段总览。`;

  let toolInput: AIResponse;
  try {
    const resp = await client.messages.create({
      model: anthropicModel(),
      max_tokens: 1500,
      temperature: 0.7,
      system: SYSTEM_PROMPT,
      tools: [STAGE_TOOL],
      tool_choice: { type: "tool", name: STAGE_TOOL.name },
      messages: [{ role: "user", content: userPrompt }],
    });

    const toolBlock = resp.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      console.error("[ai/stage] no tool_use block in response", resp);
      return NextResponse.json(
        { error: "AI 没有返回结构化结果，请稍后再试" },
        { status: 502 }
      );
    }
    toolInput = toolBlock.input as AIResponse;
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json(
      { error: `AI 请求失败：${msg}` },
      { status: 502 }
    );
  }

  if (
    typeof toolInput?.title !== "string" ||
    typeof toolInput.why_it_matters !== "string"
  ) {
    console.error(
      "[ai/stage] AI returned malformed shape:",
      JSON.stringify(toolInput, null, 2)
    );
    return NextResponse.json(
      { error: "AI 返回的结果缺少必要字段", raw: toolInput },
      { status: 502 }
    );
  }

  // Stitch the 6 flat note_* fields back into the FocusArea[] shape that
  // the rest of the app (and the DB) speaks. Missing notes get an empty
  // string — the editor will simply show that area as not yet filled.
  const focusAreas: FocusArea[] = AREA_LABEL.map(({ key, area }) => {
    const note = (toolInput as Record<string, unknown>)[key];
    return {
      area,
      note: typeof note === "string" ? note.trim() : "",
    };
  });

  return NextResponse.json({
    title: toolInput.title,
    whyItMatters: toolInput.why_it_matters,
    focusAreas,
  });
}

// Reusable Chinese prompt fragments for AI-layer code. These are plain
// string constants — NOT wired through next-intl. The AI layer is
// Chinese-native; we never pay a runtime translation cost and never
// tack a "respond in Chinese" instruction onto an English prompt.

// Preserve proper nouns so Claude doesn't force-translate program,
// school, or test names and doesn't mangle URLs.
export const PROPER_NOUN_RULE =
  "专有名词保留原文（项目名、学校名、考试名如 TOEFL/SAT/ACT/AP/IB、书名、URL 等），不要强行翻译。允许中英混排。";

// Tone setter used across student-facing generators (stage overview,
// activity summaries, reflection summaries, timeline hover).
export const SECOND_PERSON_VOICE =
  "以第二人称直接对学生说话，语气真诚、具体、不煽情，像一位了解 TA 的顾问。";

// Handling user-authored text that may itself mix Chinese and English.
// This is mentioned in prompts that summarize student notes so Claude
// doesn't try to normalize the user's voice.
export const MIXED_LANGUAGE_INPUT_NOTE =
  "学生的笔记本身可能中英混排；不要翻译或改写原文，保留 TA 的语言习惯。输出使用简体中文作为叙述语言即可。";

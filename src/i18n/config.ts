// Single source of truth for the current UI locale.
// The app is Chinese-only for now. Future-proofing: if/when we add
// English, introduce a `[locale]` route segment and replace this with
// per-request resolution. AI-layer code does NOT read this — AI prompts
// are native Chinese literals in source regardless of UI locale.
export const LOCALE = "zh-CN" as const;
export type Locale = typeof LOCALE;

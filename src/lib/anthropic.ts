import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

// Default to a strong reasoning model — the stage overview is strategic
// content, so quality matters more than latency. Override via env.
export function anthropicModel(): string {
  return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
}

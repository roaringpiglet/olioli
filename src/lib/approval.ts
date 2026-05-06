import crypto from "node:crypto";

// Compact, stateless approval tokens: base64url(userId|action|exp|hmac).
// Signed with APPROVAL_SECRET so only the server can mint/verify them.
// No DB column needed — the manager can approve from a stale email and
// we re-check the user's current status at verification time.

export type ApprovalAction = "approve" | "reject";

interface Payload {
  userId: string;
  action: ApprovalAction;
  exp: number; // unix seconds
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function secret(): string {
  const s = process.env.APPROVAL_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "APPROVAL_SECRET is missing or too short (needs ≥16 chars). Set it in .env.local."
    );
  }
  return s;
}

function sign(data: string): string {
  return b64urlEncode(
    crypto.createHmac("sha256", secret()).update(data).digest()
  );
}

export function mintApprovalToken(
  userId: string,
  action: ApprovalAction,
  ttlSeconds = 60 * 60 * 24 * 7 // 7 days
): string {
  const payload: Payload = {
    userId,
    action,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = sign(body);
  return `${body}.${sig}`;
}

export function verifyApprovalToken(token: string): Payload {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new Error("Malformed token");
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid token signature");
  }
  const payload = JSON.parse(b64urlDecode(body).toString("utf8")) as Payload;
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }
  return payload;
}

export function approvalUrl(action: ApprovalAction, userId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const token = mintApprovalToken(userId, action);
  return `${base}/api/admin/approve?token=${encodeURIComponent(token)}`;
}

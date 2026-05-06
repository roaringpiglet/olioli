import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyApprovalToken } from "@/lib/approval";
import type { Profile } from "@/types/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return html(400, "缺少校验令牌");

  let payload;
  try {
    payload = verifyApprovalToken(token);
  } catch (e) {
    return html(400, `链接无效或已过期：${(e as Error).message}`);
  }

  const admin = createSupabaseAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("*")
    .eq("id", payload.userId)
    .maybeSingle<Profile>();

  if (error) return html(500, "数据库错误");
  if (!profile) return html(404, "用户不存在");

  if (profile.status !== "pending") {
    const statusLabel =
      profile.status === "approved"
        ? "已通过"
        : profile.status === "rejected"
          ? "已拒绝"
          : profile.status;
    return html(
      200,
      `该用户已处于 <strong>${statusLabel}</strong> 状态，未做任何更改。`
    );
  }

  const nextStatus = payload.action === "approve" ? "approved" : "rejected";

  const { error: updErr } = await admin
    .from("profiles")
    .update({ status: nextStatus })
    .eq("id", profile.id);
  if (updErr) return html(500, "更新用户状态失败");

  // When approving a counselor/parent with a linked student, create the
  // support_links row so they can read the student's plan.
  if (
    nextStatus === "approved" &&
    (profile.role === "counselor" || profile.role === "parent") &&
    profile.requested_student_email
  ) {
    const { data: student } = await admin
      .from("profiles")
      .select("id, status")
      .eq("email", profile.requested_student_email)
      .eq("role", "student")
      .maybeSingle<{ id: string; status: string }>();
    if (student) {
      await admin
        .from("support_links")
        .upsert(
          { supporter_id: profile.id, student_id: student.id },
          { onConflict: "supporter_id,student_id" }
        );
    }
  }

  return html(
    200,
    nextStatus === "approved"
      ? `<strong>${profile.full_name ?? profile.email}</strong> 已通过审批，TA 现在可以登录了。`
      : `<strong>${profile.full_name ?? profile.email}</strong> 已被拒绝。`
  );
}

function html(status: number, message: string) {
  const body = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>账号审批</title>
<style>
  body{font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",system-ui,-apple-system,Segoe UI,sans-serif;background:#f6f7f9;padding:80px 24px;color:#0f1320;}
  .card{max-width:520px;margin:0 auto;background:#fff;padding:32px;border:1px solid #d5d9e2;border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.04);}
  h1{font-size:18px;margin:0 0 8px;}
  p{font-size:14px;line-height:1.7;margin:0;color:#4a5163;}
</style></head>
<body><div class="card"><h1>账号审批</h1><p>${message}</p></div></body></html>`;
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

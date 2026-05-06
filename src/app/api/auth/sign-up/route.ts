import { NextResponse } from "next/server";
import { z } from "./schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { approvalUrl } from "@/lib/approval";
import type { Role } from "@/types/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求数据格式不正确" }, { status: 400 });
  }

  const parsed = z.signUpInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "请检查填写的内容" },
      { status: 400 }
    );
  }
  const { email, password, fullName, role, requestedStudentEmail } = parsed.data;

  const admin = createSupabaseAdminClient();

  // Create the auth user. Auto-confirm so signing in is blocked by our
  // "approved" gate rather than an email verification step (which would
  // muddle the manager-approval UX).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });

  if (createErr || !created.user) {
    const msg = createErr?.message ?? "账号创建失败";
    const status = /already/i.test(msg) ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }

  const userId = created.user.id;

  // Create the profile row with status='pending'.
  const { error: profileErr } = await admin.from("profiles").insert({
    id: userId,
    email,
    full_name: fullName,
    role: role as Role,
    status: "pending",
    requested_student_email: requestedStudentEmail ?? null,
  });

  if (profileErr) {
    // Roll back the auth user so the email can be re-used.
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  // Notify the manager. If Resend isn't configured, email.ts logs to console.
  const managerEmail = process.env.MANAGER_EMAIL;
  if (managerEmail) {
    const approve = approvalUrl("approve", userId);
    const reject = approvalUrl("reject", userId);
    const roleLabel =
      role === "counselor" ? "顾问" : role === "student" ? "学生" : "家长";
    const supportNote = requestedStudentEmail
      ? `<p>TA 想支持的学生：<strong>${escapeHtml(
          requestedStudentEmail
        )}</strong></p>`
      : "";
    await sendEmail({
      to: managerEmail,
      subject: `[升学 OS] 新的访问申请：${fullName}（${roleLabel}）`,
      html: `
        <p>有新用户申请访问系统：</p>
        <ul>
          <li><strong>姓名：</strong> ${escapeHtml(fullName)}</li>
          <li><strong>邮箱：</strong> ${escapeHtml(email)}</li>
          <li><strong>角色：</strong> ${escapeHtml(roleLabel)}</li>
        </ul>
        ${supportNote}
        <p>
          <a href="${approve}" style="background:#3b6ef5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block;margin-right:8px;">通过</a>
          <a href="${reject}" style="color:#b91c1c;padding:10px 16px;border:1px solid #fecaca;border-radius:8px;text-decoration:none;display:inline-block;">拒绝</a>
        </p>
        <p style="font-size:12px;color:#6b7280;">
          链接 7 天内有效。如果该用户已经被处理过，再点击不会造成影响。
        </p>
      `,
      text: `新的访问申请\n姓名：${fullName}\n邮箱：${email}\n角色：${roleLabel}\n\n通过：${approve}\n拒绝：${reject}`,
    });
  } else {
    // No MANAGER_EMAIL → still log the URLs so the dev can approve.
    console.warn(
      "[auth:sign-up] MANAGER_EMAIL is not set. Manual approval required."
    );
    console.log("Approve URL:", approvalUrl("approve", userId));
    console.log("Reject  URL:", approvalUrl("reject", userId));
  }

  return NextResponse.json({ ok: true });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

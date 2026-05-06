"use server";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { loadSession } from "@/lib/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";
import { sendEmail } from "@/lib/email";
import type {
  AgendaItem,
  Meeting,
  MeetingAIExtract,
  MeetingStatus,
  MeetingSuggestion,
  MeetingSuggestionDecision,
  MeetingSuggestionKind,
} from "@/types/db";

// -----------------------------------------------------------------------
// Counselor actions: create / edit / delete meetings
// -----------------------------------------------------------------------

interface SaveMeetingInput {
  id?: string;
  title: string;
  scheduled_at: string | null; // ISO timestamp
  duration_minutes?: number | null;
  meeting_link?: string | null;
  agenda?: AgendaItem[];
  status?: MeetingStatus;
  // Used for back-filling past meetings: the counselor can save notes at
  // the moment of creation so AI has immediate context to work with.
  notes?: string | null;
}

export async function saveMeeting(input: SaveMeetingInput): Promise<Meeting> {
  const { profile, studentId } = await loadSession();
  if (!can.manageMeetings(profile.role)) throw new Error("没有权限执行此操作");
  if (!studentId) throw new Error("没有关联的学生");
  if (!input.title.trim()) throw new Error("请填写标题");

  const db = createSupabaseAdminClient();
  const row: Record<string, unknown> = {
    student_id: studentId,
    title: input.title.trim(),
    scheduled_at: input.scheduled_at,
    duration_minutes: input.duration_minutes ?? 30,
    meeting_link: input.meeting_link?.trim() || null,
    agenda: input.agenda ?? [],
    created_by: profile.id,
  };
  if (input.status) row.status = input.status;
  if (input.notes !== undefined) row.notes = input.notes?.trim() || null;

  const q = input.id
    ? db
        .from("meetings")
        .update(row)
        .eq("id", input.id)
        .select("*")
        .single<Meeting>()
    : db
        .from("meetings")
        .insert({ ...row, status: input.status ?? "scheduled" })
        .select("*")
        .single<Meeting>();

  const { data, error } = await q;
  if (error) throw error;
  revalidatePath("/meetings");
  return data;
}

export async function deleteMeeting(id: string): Promise<void> {
  const { profile } = await loadSession();
  if (!can.manageMeetings(profile.role)) throw new Error("没有权限执行此操作");

  const db = createSupabaseAdminClient();

  // Reopen any topics that were folded into this meeting so they go
  // back into the shared backlog instead of being orphaned.
  await db
    .from("meeting_topics")
    .update({ status: "open", scheduled_meeting_id: null })
    .eq("scheduled_meeting_id", id)
    .eq("status", "scheduled");

  const { error } = await db.from("meetings").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/meetings");
}

export async function cancelMeeting(id: string): Promise<void> {
  const { profile } = await loadSession();
  if (!can.manageMeetings(profile.role)) throw new Error("没有权限执行此操作");

  const db = createSupabaseAdminClient();
  const { error } = await db
    .from("meetings")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) throw error;

  // Any topics that were scheduled into this meeting go back into the
  // open backlog so they don't get lost.
  await db
    .from("meeting_topics")
    .update({ status: "open", scheduled_meeting_id: null })
    .eq("scheduled_meeting_id", id)
    .eq("status", "scheduled");

  revalidatePath("/meetings");
}

// -----------------------------------------------------------------------
// Student: request a meeting. Counselor gets an email notification.
// -----------------------------------------------------------------------

interface RequestMeetingInput {
  topic: string;
  preferred_time?: string | null; // free-text, e.g. "Tues afternoon"
}

export async function requestMeeting(
  input: RequestMeetingInput
): Promise<Meeting> {
  const { profile, studentId } = await loadSession();
  if (!can.requestMeeting(profile.role)) throw new Error("没有权限执行此操作");
  if (!studentId) throw new Error("没有关联的学生");
  if (!input.topic.trim()) throw new Error("请写下讨论主题");

  const db = createSupabaseAdminClient();
  const title = input.topic.trim().slice(0, 140);
  const { data: meeting, error } = await db
    .from("meetings")
    .insert({
      student_id: studentId,
      title,
      status: "requested",
      request_topic: input.topic.trim(),
      scheduled_at: null,
      duration_minutes: 30,
      agenda: [],
      requested_by: profile.id,
      created_by: profile.id,
    })
    .select("*")
    .single<Meeting>();
  if (error) throw error;

  // Notify any counselor(s) linked to this student.
  const { data: supporters } = await db
    .from("support_links")
    .select("supporter_id")
    .eq("student_id", studentId);

  if (supporters && supporters.length > 0) {
    const ids = supporters.map((s) => s.supporter_id);
    const { data: counselors } = await db
      .from("profiles")
      .select("id, email, full_name, role, status")
      .in("id", ids)
      .eq("role", "counselor")
      .eq("status", "approved");

    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const meetingUrl = `${base}/meetings?meeting=${meeting.id}`;
    const studentName = profile.full_name ?? profile.email;
    const prefLine = input.preferred_time
      ? `<p style="margin:0 0 12px"><strong>期望的时间：</strong> ${escapeHtml(
          input.preferred_time
        )}</p>`
      : "";

    await Promise.all(
      (counselors ?? []).map((c) =>
        sendEmail({
          to: c.email,
          subject: `${studentName} 提交了新的会谈申请`,
          html: `<p><strong>${escapeHtml(studentName)}</strong> 申请了一次会谈。</p>
<p style="margin:0 0 12px"><strong>想讨论的内容：</strong> ${escapeHtml(input.topic)}</p>
${prefLine}
<p><a href="${meetingUrl}">打开查看并处理申请</a>（可以确认时间或拒绝）。</p>`,
          text: `${studentName} 申请了一次会谈。\n想讨论的内容：${input.topic}\n${
            input.preferred_time ? `期望的时间：${input.preferred_time}\n` : ""
          }查看：${meetingUrl}`,
        }).catch((e) => console.error("[meetings] email send failed", e))
      )
    );
  }

  revalidatePath("/meetings");
  return meeting;
}

// -----------------------------------------------------------------------
// Counselor: approve or reject a student's meeting request
// -----------------------------------------------------------------------

interface ApproveRequestInput {
  id: string;
  scheduled_at: string; // ISO timestamp
  duration_minutes?: number | null;
  meeting_link?: string | null;
  agenda?: AgendaItem[];
}

export async function approveMeetingRequest(
  input: ApproveRequestInput
): Promise<Meeting> {
  const { profile } = await loadSession();
  if (!can.manageMeetings(profile.role)) throw new Error("没有权限执行此操作");
  if (!input.scheduled_at) throw new Error("请选择时间");

  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("meetings")
    .update({
      status: "scheduled",
      scheduled_at: input.scheduled_at,
      duration_minutes: input.duration_minutes ?? 30,
      meeting_link: input.meeting_link?.trim() || null,
      agenda: input.agenda ?? [],
    })
    .eq("id", input.id)
    .select("*")
    .single<Meeting>();
  if (error) throw error;
  revalidatePath("/meetings");
  return data;
}

export async function rejectMeetingRequest(
  id: string,
  reason?: string | null
): Promise<void> {
  const { profile } = await loadSession();
  if (!can.manageMeetings(profile.role)) throw new Error("没有权限执行此操作");

  const db = createSupabaseAdminClient();
  const { error } = await db
    .from("meetings")
    .update({
      status: "rejected",
      rejection_reason: reason?.trim() || null,
    })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/meetings");
}

// -----------------------------------------------------------------------
// Counselor: post-meeting notes + AI extract decisions
// -----------------------------------------------------------------------

export async function saveMeetingNotes(
  id: string,
  notes: string,
  opts: { markCompleted?: boolean } = {}
): Promise<Meeting> {
  const { profile } = await loadSession();
  if (!can.manageMeetings(profile.role)) throw new Error("没有权限执行此操作");

  const db = createSupabaseAdminClient();
  const update: Record<string, unknown> = { notes };
  if (opts.markCompleted) update.status = "completed";

  const { data, error } = await db
    .from("meetings")
    .update(update)
    .eq("id", id)
    .select("*")
    .single<Meeting>();
  if (error) throw error;

  // When the meeting is marked completed, auto-close any topics that
  // were folded into it. Keep manually-edited agenda items untouched.
  if (opts.markCompleted) {
    await db
      .from("meeting_topics")
      .update({ status: "completed" })
      .eq("scheduled_meeting_id", id)
      .neq("status", "completed");
  }

  revalidatePath("/meetings");
  return data;
}

// Stores AI-extracted content on the meeting. Suggestions are brand-new
// entries — we generate a fresh id for each and default them to pending.
export async function setMeetingAIExtract(
  id: string,
  extract: MeetingAIExtract,
  suggestions: Array<{
    kind: MeetingSuggestionKind;
    title: string;
    rationale: string;
  }>
): Promise<Meeting> {
  const { profile } = await loadSession();
  if (!can.manageMeetings(profile.role)) throw new Error("没有权限执行此操作");

  const db = createSupabaseAdminClient();
  const stamped: MeetingSuggestion[] = suggestions.map((s) => ({
    id: crypto.randomUUID(),
    kind: s.kind,
    title: s.title,
    rationale: s.rationale,
    status: "pending",
  }));

  const { data, error } = await db
    .from("meetings")
    .update({
      ai_extracted: extract,
      ai_suggestions: stamped,
    })
    .eq("id", id)
    .select("*")
    .single<Meeting>();
  if (error) throw error;
  revalidatePath("/meetings");
  return data;
}

// Counselor decides on a single AI suggestion. We modify the jsonb array
// in place rather than introducing a companion table — volume is low.
export async function decideMeetingSuggestion(
  meetingId: string,
  suggestionId: string,
  decision: Exclude<MeetingSuggestionDecision, "pending">
): Promise<Meeting> {
  const { profile } = await loadSession();
  if (!can.manageMeetings(profile.role)) throw new Error("没有权限执行此操作");

  const db = createSupabaseAdminClient();
  const { data: existing, error: e1 } = await db
    .from("meetings")
    .select("ai_suggestions")
    .eq("id", meetingId)
    .single<{ ai_suggestions: MeetingSuggestion[] }>();
  if (e1) throw e1;

  const next = (existing.ai_suggestions ?? []).map((s) =>
    s.id === suggestionId
      ? {
          ...s,
          status: decision,
          decided_by: profile.id,
          decided_at: new Date().toISOString(),
        }
      : s
  );

  const { data, error } = await db
    .from("meetings")
    .update({ ai_suggestions: next })
    .eq("id", meetingId)
    .select("*")
    .single<Meeting>();
  if (error) throw error;
  revalidatePath("/meetings");
  return data;
}

// -----------------------------------------------------------------------
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

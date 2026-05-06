"use server";
import { revalidatePath } from "next/cache";
import { loadSession } from "@/lib/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";
import type { MeetingReflection } from "@/types/db";

// Students append a reflection to a past meeting. Append-only: no edit or
// delete action is exposed. The AI summary can be filled in later via a
// separate endpoint.
export async function addReflection(
  meetingId: string,
  content: string
): Promise<MeetingReflection> {
  const { profile, studentId } = await loadSession();
  if (!can.writeReflection(profile.role))
    throw new Error("只有学生本人可以添加反思");
  if (!studentId) throw new Error("没有关联的学生");
  if (!content.trim()) throw new Error("反思内容不能为空");

  const db = createSupabaseAdminClient();

  // Guard: the meeting must belong to this student.
  const { data: mtg, error: e1 } = await db
    .from("meetings")
    .select("id, student_id")
    .eq("id", meetingId)
    .maybeSingle<{ id: string; student_id: string }>();
  if (e1) throw e1;
  if (!mtg || mtg.student_id !== studentId)
    throw new Error("找不到这次会谈");

  const { data, error } = await db
    .from("meeting_reflections")
    .insert({
      meeting_id: meetingId,
      student_id: studentId,
      content: content.trim(),
    })
    .select("*")
    .single<MeetingReflection>();
  if (error) throw error;
  revalidatePath("/meetings");
  return data;
}

// Stores a computed AI summary on a reflection (called by the API route).
export async function setReflectionAISummary(
  reflectionId: string,
  summary: string
): Promise<void> {
  const { profile, studentId } = await loadSession();
  if (!can.writeReflection(profile.role))
    throw new Error("只有学生本人可以编辑反思");
  if (!studentId) throw new Error("没有关联的学生");

  const db = createSupabaseAdminClient();
  const { error } = await db
    .from("meeting_reflections")
    .update({ ai_summary: summary })
    .eq("id", reflectionId)
    .eq("student_id", studentId);
  if (error) throw error;
  revalidatePath("/meetings");
}

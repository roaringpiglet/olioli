"use server";
import { revalidatePath } from "next/cache";
import { loadSession } from "@/lib/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { MeetingTopic } from "@/types/db";

interface SaveTopicInput {
  id?: string;
  title: string;
  notes?: string | null;
  duration_minutes?: number | null;
}

export async function saveTopic(
  input: SaveTopicInput
): Promise<MeetingTopic> {
  const { profile, studentId } = await loadSession();
  if (!studentId) throw new Error("没有关联的学生");
  if (!input.title.trim()) throw new Error("请填写标题");

  const db = createSupabaseAdminClient();
  // When editing, preserve status / scheduled_meeting_id so a scheduled
  // topic stays attached to its meeting through a title edit.
  const base: Record<string, unknown> = {
    title: input.title.trim(),
    notes: input.notes?.trim() || null,
    duration_minutes:
      input.duration_minutes != null && input.duration_minutes > 0
        ? input.duration_minutes
        : null,
  };

  const q = input.id
    ? db
        .from("meeting_topics")
        .update(base)
        .eq("id", input.id)
        .select("*")
        .single<MeetingTopic>()
    : db
        .from("meeting_topics")
        .insert({
          ...base,
          student_id: studentId,
          created_by: profile.id,
        })
        .select("*")
        .single<MeetingTopic>();

  const { data, error } = await q;
  if (error) throw error;
  revalidatePath("/meetings");
  return data;
}

export async function deleteTopic(id: string): Promise<void> {
  await loadSession();
  const db = createSupabaseAdminClient();
  const { error } = await db.from("meeting_topics").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/meetings");
}

export async function markTopicCompleted(id: string): Promise<void> {
  await loadSession();
  const db = createSupabaseAdminClient();
  const { error } = await db
    .from("meeting_topics")
    .update({ status: "completed" })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/meetings");
}

export async function reopenTopic(id: string): Promise<void> {
  await loadSession();
  const db = createSupabaseAdminClient();
  const { error } = await db
    .from("meeting_topics")
    .update({ status: "open", scheduled_meeting_id: null })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/meetings");
}

// Links a batch of topics to a meeting. Called right after creating a
// meeting from the New-meeting dialog with a selection of topics.
export async function linkTopicsToMeeting(
  meetingId: string,
  topicIds: string[]
): Promise<void> {
  if (topicIds.length === 0) return;
  const { studentId } = await loadSession();
  if (!studentId) throw new Error("没有关联的学生");

  const db = createSupabaseAdminClient();
  const { error } = await db
    .from("meeting_topics")
    .update({ status: "scheduled", scheduled_meeting_id: meetingId })
    .in("id", topicIds)
    .eq("student_id", studentId);
  if (error) throw error;
  revalidatePath("/meetings");
}

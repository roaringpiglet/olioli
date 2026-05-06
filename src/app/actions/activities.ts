"use server";
import { revalidatePath } from "next/cache";
import { loadSession } from "@/lib/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";
import type { Activity } from "@/types/db";

interface SaveActivityInput {
  id?: string;
  title: string;
  description?: string | null;
  motivation?: string | null;
  learning_outcomes?: string | null;
  narrative_relevance?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  hours_per_week?: number | null;
  role_label?: string | null;
}

export async function saveActivity(
  input: SaveActivityInput
): Promise<Activity> {
  const { profile, studentId } = await loadSession();
  if (!can.editActivities(profile.role)) throw new Error("没有权限执行此操作");
  if (!studentId) throw new Error("没有关联的学生");
  if (!input.title.trim()) throw new Error("请填写标题");

  const db = createSupabaseAdminClient();
  const base = {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    motivation: input.motivation?.trim() || null,
    learning_outcomes: input.learning_outcomes?.trim() || null,
    narrative_relevance: input.narrative_relevance?.trim() || null,
    start_date: input.start_date || null,
    end_date: input.end_date || null,
    hours_per_week:
      input.hours_per_week != null && input.hours_per_week > 0
        ? input.hours_per_week
        : null,
    role_label: input.role_label?.trim() || null,
  };

  const q = input.id
    ? db
        .from("activities")
        .update(base)
        .eq("id", input.id)
        .select("*")
        .single<Activity>()
    : db
        .from("activities")
        .insert({
          ...base,
          student_id: studentId,
          created_by: profile.id,
        })
        .select("*")
        .single<Activity>();

  const { data, error } = await q;
  if (error) throw error;
  revalidatePath("/growth");
  return data;
}

export async function deleteActivity(id: string): Promise<void> {
  const { profile } = await loadSession();
  if (!can.editActivities(profile.role)) throw new Error("没有权限执行此操作");
  const db = createSupabaseAdminClient();
  const { error } = await db.from("activities").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/growth");
}

// Called by the AI route after it computes a summary; keep this server
// action so the AI path doesn't need extra wiring.
export async function setActivityAISummary(
  id: string,
  summary: string
): Promise<void> {
  const { profile } = await loadSession();
  if (!can.editActivities(profile.role)) throw new Error("没有权限执行此操作");
  const db = createSupabaseAdminClient();
  const { error } = await db
    .from("activities")
    .update({ ai_summary: summary })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/growth");
}

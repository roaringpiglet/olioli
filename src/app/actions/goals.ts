"use server";
import { revalidatePath } from "next/cache";
import { loadSession } from "@/lib/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";
import type { MonthlyGoal, TimelineTrack } from "@/types/db";

interface SaveGoalInput {
  id?: string;
  month: string; // YYYY-MM-01
  title: string;
  description?: string;
  order?: number;
  track?: TimelineTrack | null;
  thread?: string | null;
}

export async function saveMonthlyGoal(input: SaveGoalInput): Promise<MonthlyGoal> {
  const { profile, studentId } = await loadSession();
  if (!can.editMonthlyGoals(profile.role)) throw new Error("没有权限执行此操作");
  if (!studentId) throw new Error("没有关联的学生");
  if (!input.title.trim()) throw new Error("请填写标题");

  const db = createSupabaseAdminClient();
  const row = {
    student_id: studentId,
    month: input.month,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    order: input.order ?? 0,
    track: input.track ?? null,
    thread: input.thread?.trim() || null,
    created_by: profile.id,
  };

  const query = input.id
    ? db
        .from("monthly_goals")
        .update(row)
        .eq("id", input.id)
        .select("*")
        .single<MonthlyGoal>()
    : db.from("monthly_goals").insert(row).select("*").single<MonthlyGoal>();

  const { data, error } = await query;
  if (error) throw error;
  revalidatePath("/");
  revalidatePath("/timeline");
  return data;
}

export async function deleteMonthlyGoal(id: string): Promise<void> {
  const { profile } = await loadSession();
  if (!can.editMonthlyGoals(profile.role)) throw new Error("没有权限执行此操作");

  const db = createSupabaseAdminClient();
  const { error } = await db.from("monthly_goals").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/");
}

export async function reorderMonthlyGoals(
  ids: string[]
): Promise<void> {
  const { profile } = await loadSession();
  if (!can.editMonthlyGoals(profile.role)) throw new Error("没有权限执行此操作");

  const db = createSupabaseAdminClient();
  await Promise.all(
    ids.map((id, i) => db.from("monthly_goals").update({ order: i }).eq("id", id))
  );
  revalidatePath("/");
}

// Counselor/manager can mark any goal achieved or unachieved.
// Students can only flip achievement on their own goals — and *only* that
// field; everything else (title/description/track/thread/order) stays with
// the counselor.
export async function setMonthlyGoalAchievement(input: {
  id: string;
  achieved: boolean;
}): Promise<MonthlyGoal> {
  const { profile } = await loadSession();
  if (!can.markGoalAchievement(profile.role))
    throw new Error("没有权限执行此操作");

  const db = createSupabaseAdminClient();

  const { data: existing, error: fetchErr } = await db
    .from("monthly_goals")
    .select("*")
    .eq("id", input.id)
    .maybeSingle<MonthlyGoal>();
  if (fetchErr) throw fetchErr;
  if (!existing) throw new Error("找不到这条目标");

  if (
    profile.role === "student" &&
    existing.student_id !== profile.id
  ) {
    throw new Error("没有权限执行此操作");
  }

  const patch = input.achieved
    ? {
        achieved_at: new Date().toISOString(),
        achieved_by: profile.id,
      }
    : {
        achieved_at: null,
        achieved_by: null,
      };

  const { data, error } = await db
    .from("monthly_goals")
    .update(patch)
    .eq("id", input.id)
    .select("*")
    .single<MonthlyGoal>();
  if (error) throw error;
  revalidatePath("/");
  revalidatePath("/timeline");
  return data;
}

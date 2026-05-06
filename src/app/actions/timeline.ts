"use server";
import { revalidatePath } from "next/cache";
import { loadSession } from "@/lib/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";
import type {
  TimelineItem,
  TimelineStatus,
  TimelineTrack,
} from "@/types/db";

interface SaveInput {
  id?: string;
  track: TimelineTrack;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  status?: TimelineStatus;
  monthlyGoalId?: string | null;
  thread?: string | null;
}

export async function saveTimelineItem(
  input: SaveInput
): Promise<TimelineItem> {
  const { profile, studentId } = await loadSession();
  if (!can.manageTimeline(profile.role)) throw new Error("没有权限执行此操作");
  if (!studentId) throw new Error("没有关联的学生");
  if (!input.title.trim()) throw new Error("请填写标题");
  if (input.endDate < input.startDate)
    throw new Error("结束日期必须晚于或等于开始日期");

  const db = createSupabaseAdminClient();
  const row = {
    student_id: studentId,
    track: input.track,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    start_date: input.startDate,
    end_date: input.endDate,
    status: input.status ?? "planned",
    monthly_goal_id: input.monthlyGoalId || null,
    thread: input.thread?.trim() || null,
    created_by: profile.id,
  };

  const query = input.id
    ? db
        .from("timeline_items")
        .update(row)
        .eq("id", input.id)
        .select("*")
        .single<TimelineItem>()
    : db.from("timeline_items").insert(row).select("*").single<TimelineItem>();

  const { data, error } = await query;
  if (error) throw error;

  revalidatePath("/timeline");
  revalidatePath("/");
  return data;
}

export async function deleteTimelineItem(id: string): Promise<void> {
  const { profile } = await loadSession();
  if (!can.manageTimeline(profile.role)) throw new Error("没有权限执行此操作");
  const db = createSupabaseAdminClient();
  const { error } = await db.from("timeline_items").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/timeline");
  revalidatePath("/");
}

export async function setTimelineItemStatus(
  id: string,
  status: TimelineStatus
): Promise<void> {
  const { profile } = await loadSession();
  if (!can.manageTimeline(profile.role)) throw new Error("没有权限执行此操作");
  const db = createSupabaseAdminClient();
  const { error } = await db
    .from("timeline_items")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/timeline");
  revalidatePath("/");
}

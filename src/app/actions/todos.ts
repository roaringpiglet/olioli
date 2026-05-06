"use server";
import { revalidatePath } from "next/cache";
import { loadSession } from "@/lib/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";
import type { TimelineTrack, TodoStatus, WeeklyTodo } from "@/types/db";

interface CreateTodoInput {
  weekStart: string;
  title: string;
  monthlyGoalId?: string;
  notes?: string;
  track?: TimelineTrack | null;
}

export async function createTodo(input: CreateTodoInput): Promise<WeeklyTodo> {
  const { profile, studentId } = await loadSession();
  if (!can.manageTodos(profile.role)) throw new Error("没有权限执行此操作");
  if (!studentId) throw new Error("没有关联的学生");
  if (!input.title.trim()) throw new Error("请填写标题");

  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("weekly_todos")
    .insert({
      student_id: studentId,
      week_start: input.weekStart,
      title: input.title.trim(),
      monthly_goal_id: input.monthlyGoalId || null,
      notes: input.notes?.trim() || null,
      track: input.track ?? null,
      created_by: profile.id,
    })
    .select("*")
    .single<WeeklyTodo>();
  if (error) throw error;
  revalidatePath("/");
  return data;
}

interface UpdateTodoInput {
  id: string;
  title?: string;
  monthlyGoalId?: string | null;
  notes?: string | null;
  status?: TodoStatus;
  track?: TimelineTrack | null;
}

export async function updateTodo(input: UpdateTodoInput): Promise<WeeklyTodo> {
  const { profile } = await loadSession();
  const db = createSupabaseAdminClient();

  // Load existing row to enforce field-level permissions.
  const { data: existing, error: fetchErr } = await db
    .from("weekly_todos")
    .select("*")
    .eq("id", input.id)
    .maybeSingle<WeeklyTodo>();
  if (fetchErr) throw fetchErr;
  if (!existing) throw new Error("找不到该任务");

  const patch: Partial<WeeklyTodo> = {};

  // Students can edit their own todo's title, status, and notes.
  // Goal linkage and track stay with the counselor.
  if (profile.role === "student") {
    if (existing.student_id !== profile.id) throw new Error("没有权限执行此操作");
    if (input.title !== undefined) {
      const next = input.title.trim();
      if (!next) throw new Error("请填写标题");
      patch.title = next;
    }
    if (input.status !== undefined) patch.status = input.status;
    if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  } else if (can.manageTodos(profile.role)) {
    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.monthlyGoalId !== undefined)
      patch.monthly_goal_id = input.monthlyGoalId || null;
    if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
    if (input.status !== undefined) patch.status = input.status;
    if (input.track !== undefined) patch.track = input.track;
  } else {
    throw new Error("没有权限执行此操作");
  }

  if (patch.status === "done") {
    patch.completed_at = new Date().toISOString();
    patch.completed_by = profile.id;
  } else if (patch.status !== undefined) {
    patch.completed_at = null;
    patch.completed_by = null;
  }

  const { data, error } = await db
    .from("weekly_todos")
    .update(patch)
    .eq("id", input.id)
    .select("*")
    .single<WeeklyTodo>();
  if (error) throw error;
  revalidatePath("/");
  return data;
}

export async function deleteTodo(id: string): Promise<void> {
  const { profile } = await loadSession();
  if (!can.manageTodos(profile.role)) throw new Error("没有权限执行此操作");
  const db = createSupabaseAdminClient();
  const { error } = await db.from("weekly_todos").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/");
}

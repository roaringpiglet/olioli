"use server";
import { revalidatePath } from "next/cache";
import { loadSession } from "@/lib/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";
import type { IdeaBoard } from "@/types/db";

interface SaveBoardInput {
  id?: string;
  title: string;
  description?: string | null;
  content?: string | null;
}

export async function saveIdeaBoard(
  input: SaveBoardInput
): Promise<IdeaBoard> {
  const { profile, studentId } = await loadSession();
  if (!can.editIdeas(profile.role)) throw new Error("没有权限执行此操作");
  if (!studentId) throw new Error("没有关联的学生");
  if (!input.title.trim()) throw new Error("请填写标题");

  const db = createSupabaseAdminClient();
  const base: Record<string, unknown> = {
    title: input.title.trim(),
    description: input.description?.trim() || null,
  };
  // Only touch content if it was explicitly provided — editing just the
  // title from a card shouldn't blow away the body.
  if (input.content !== undefined) {
    base.content = input.content?.trim() ? input.content : null;
  }

  if (input.id) {
    const { data, error } = await db
      .from("idea_boards")
      .update(base)
      .eq("id", input.id)
      .select("*")
      .single<IdeaBoard>();
    if (error) throw error;
    revalidatePath("/growth");
    return data;
  }

  const { data: last } = await db
    .from("idea_boards")
    .select('"order"')
    .eq("student_id", studentId)
    .order("order", { ascending: false })
    .limit(1)
    .maybeSingle<{ order: number }>();
  const nextOrder = (last?.order ?? -1) + 1;

  const { data, error } = await db
    .from("idea_boards")
    .insert({
      ...base,
      student_id: studentId,
      order: nextOrder,
      created_by: profile.id,
    })
    .select("*")
    .single<IdeaBoard>();
  if (error) throw error;
  revalidatePath("/growth");
  return data;
}

export async function deleteIdeaBoard(id: string): Promise<void> {
  const { profile } = await loadSession();
  if (!can.editIdeas(profile.role)) throw new Error("没有权限执行此操作");
  const db = createSupabaseAdminClient();
  const { error } = await db.from("idea_boards").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/growth");
}

"use server";
import { revalidatePath } from "next/cache";
import { loadSession } from "@/lib/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";
import type { NarrativeEntry, NarrativeKind } from "@/types/db";

interface SaveNarrativeInput {
  id?: string;
  kind: NarrativeKind;
  title: string;
  content?: string | null;
}

export async function saveNarrativeEntry(
  input: SaveNarrativeInput
): Promise<NarrativeEntry> {
  const { profile, studentId } = await loadSession();
  if (!can.editNarrative(profile.role)) throw new Error("没有权限执行此操作");
  if (!studentId) throw new Error("没有关联的学生");
  if (!input.title.trim()) throw new Error("请填写标题");

  const db = createSupabaseAdminClient();
  const base = {
    kind: input.kind,
    title: input.title.trim(),
    content: input.content?.trim() || null,
  };

  const q = input.id
    ? db
        .from("narrative_entries")
        .update(base)
        .eq("id", input.id)
        .select("*")
        .single<NarrativeEntry>()
    : db
        .from("narrative_entries")
        .insert({
          ...base,
          student_id: studentId,
          created_by: profile.id,
        })
        .select("*")
        .single<NarrativeEntry>();

  const { data, error } = await q;
  if (error) throw error;
  revalidatePath("/growth");
  return data;
}

export async function deleteNarrativeEntry(id: string): Promise<void> {
  const { profile } = await loadSession();
  if (!can.editNarrative(profile.role)) throw new Error("没有权限执行此操作");
  const db = createSupabaseAdminClient();
  const { error } = await db.from("narrative_entries").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/growth");
}

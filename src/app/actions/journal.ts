"use server";
import { revalidatePath } from "next/cache";
import { loadSession } from "@/lib/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";
import type { JournalEntry } from "@/types/db";

interface SaveJournalInput {
  id?: string;
  entry_date?: string | null; // YYYY-MM-DD; defaults to today
  content: string;
}

export async function saveJournalEntry(
  input: SaveJournalInput
): Promise<JournalEntry> {
  const { profile, studentId } = await loadSession();
  if (!can.writeJournal(profile.role)) throw new Error("没有权限执行此操作");
  if (!studentId) throw new Error("没有关联的学生");
  if (!input.content.trim()) throw new Error("请填写内容");

  const db = createSupabaseAdminClient();
  const base: Record<string, unknown> = {
    content: input.content.trim(),
  };
  if (input.entry_date) base.entry_date = input.entry_date;

  const q = input.id
    ? db
        .from("journal_entries")
        .update(base)
        .eq("id", input.id)
        .eq("student_id", studentId)
        .select("*")
        .single<JournalEntry>()
    : db
        .from("journal_entries")
        .insert({ ...base, student_id: studentId })
        .select("*")
        .single<JournalEntry>();

  const { data, error } = await q;
  if (error) throw error;
  revalidatePath("/growth");
  return data;
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const { profile, studentId } = await loadSession();
  if (!can.writeJournal(profile.role)) throw new Error("没有权限执行此操作");
  if (!studentId) throw new Error("没有关联的学生");

  const db = createSupabaseAdminClient();
  const { error } = await db
    .from("journal_entries")
    .delete()
    .eq("id", id)
    .eq("student_id", studentId);
  if (error) throw error;
  revalidatePath("/growth");
}

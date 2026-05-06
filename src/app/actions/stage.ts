"use server";
import { revalidatePath } from "next/cache";
import { loadSession } from "@/lib/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";
import type { FocusArea, Stage } from "@/types/db";

interface UpsertStageInput {
  id?: string;
  title: string;
  startDate: string;
  endDate: string;
  whyItMatters?: string;
  focusAreas: FocusArea[];
  aiGenerated?: boolean;
}

function clean(x: FocusArea[]): FocusArea[] {
  return x
    .map((a) => ({ area: a.area.trim(), note: a.note.trim() }))
    .filter((a) => a.area.length > 0);
}

export async function upsertStage(input: UpsertStageInput): Promise<Stage> {
  const { profile, studentId } = await loadSession();
  if (!can.editStage(profile.role)) throw new Error("没有权限执行此操作");
  if (!studentId) throw new Error("没有关联的学生");

  if (!input.title.trim()) throw new Error("请填写标题");
  if (input.endDate < input.startDate)
    throw new Error("结束日期必须晚于或等于开始日期");

  const db = createSupabaseAdminClient();
  const row = {
    student_id: studentId,
    title: input.title.trim(),
    start_date: input.startDate,
    end_date: input.endDate,
    why_it_matters: input.whyItMatters?.trim() || null,
    focus_areas: clean(input.focusAreas),
    ai_generated: input.aiGenerated ?? false,
    created_by: profile.id,
  };

  const query = input.id
    ? db.from("stages").update(row).eq("id", input.id).select("*").single<Stage>()
    : db.from("stages").insert(row).select("*").single<Stage>();
  const { data, error } = await query;
  if (error) throw error;

  revalidatePath("/");
  return data;
}

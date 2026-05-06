import { loadSession } from "@/lib/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { TopBar } from "@/components/TopBar";
import { GrowthClient } from "@/components/growth/GrowthClient";
import type {
  Activity,
  GrowthInsight,
  GrowthReminderState,
  IdeaBoard,
  JournalEntry,
  NarrativeEntry,
  Profile,
} from "@/types/db";

export default async function GrowthPage() {
  const { profile, studentId } = await loadSession();
  if (!studentId) return <UnlinkedPanel profile={profile} />;

  const db = createSupabaseAdminClient();

  const [
    narrativeRes,
    activitiesRes,
    insightsRes,
    journalRes,
    ideaBoardsRes,
    remindersRes,
    studentRes,
    creatorsRes,
  ] = await Promise.all([
    db
      .from("narrative_entries")
      .select("*")
      .eq("student_id", studentId)
      .order("kind", { ascending: true })
      .order("created_at", { ascending: false }),
    db
      .from("activities")
      .select("*")
      .eq("student_id", studentId)
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    db
      .from("growth_insights")
      .select("*")
      .eq("student_id", studentId)
      .maybeSingle<GrowthInsight>(),
    // Journal is private to the student. Counselor and parent see nothing.
    profile.role === "student" || profile.role === "manager"
      ? db
          .from("journal_entries")
          .select("*")
          .eq("student_id", studentId)
          .order("entry_date", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as JournalEntry[], error: null }),
    db
      .from("idea_boards")
      .select("*")
      .eq("student_id", studentId)
      .order("order", { ascending: true })
      .order("created_at", { ascending: true }),
    db
      .from("growth_reminders")
      .select("*")
      .eq("student_id", studentId)
      .maybeSingle<GrowthReminderState>(),
    db
      .from("profiles")
      .select("full_name")
      .eq("id", studentId)
      .maybeSingle<{ full_name: string | null }>(),
    db.from("profiles").select("id, full_name, email, role"),
  ]);

  if (narrativeRes.error) throw narrativeRes.error;
  if (activitiesRes.error) throw activitiesRes.error;
  if ("error" in journalRes && journalRes.error) throw journalRes.error;
  if (ideaBoardsRes.error) throw ideaBoardsRes.error;

  const creators: Record<string, { name: string; role: string }> = {};
  for (const p of creatorsRes.data ?? []) {
    creators[p.id] = { name: p.full_name ?? p.email ?? "", role: p.role };
  }

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        profile={profile}
        studentName={studentRes.data?.full_name ?? null}
      />
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-6">
        <GrowthClient
          profile={profile}
          studentId={studentId}
          narrative={(narrativeRes.data ?? []) as NarrativeEntry[]}
          activities={(activitiesRes.data ?? []) as Activity[]}
          journal={(journalRes.data ?? []) as JournalEntry[]}
          insights={insightsRes.data ?? null}
          ideaBoards={(ideaBoardsRes.data ?? []) as IdeaBoard[]}
          reminders={remindersRes.data ?? null}
          creators={creators}
        />
      </main>
      <footer className="border-t border-ink-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-3 text-xs text-ink-400">
          升学 OS · v0.2
        </div>
      </footer>
    </div>
  );
}

function UnlinkedPanel({ profile }: { profile: Profile }) {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar profile={profile} />
      <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-10">
        <div className="card p-6">
          <h2 className="text-base font-semibold text-ink-900">
            你还没有关联到学生
          </h2>
          <p className="text-sm text-ink-600 mt-2">
            你的账号已通过审批，但还没有与任何学生的计划关联起来。请联系管理者确认你支持的学生。
          </p>
        </div>
      </main>
    </div>
  );
}

export const dynamic = "force-dynamic";

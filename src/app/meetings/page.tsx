import { loadSession } from "@/lib/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { TopBar } from "@/components/TopBar";
import { MeetingsClient } from "@/components/meetings/MeetingsClient";
import type {
  Meeting,
  MeetingReflection,
  MeetingTopic,
  Profile,
} from "@/types/db";

interface PageProps {
  searchParams: { meeting?: string };
}

export default async function MeetingsPage({ searchParams }: PageProps) {
  const { profile, studentId } = await loadSession();
  if (!studentId) return <UnlinkedPanel profile={profile} />;

  const db = createSupabaseAdminClient();

  const [meetingsRes, studentRes, reflectionsRes, topicsRes, creatorsRes] =
    await Promise.all([
    db
      .from("meetings")
      .select("*")
      .eq("student_id", studentId)
      .order("scheduled_at", { ascending: true, nullsFirst: true }),
    db
      .from("profiles")
      .select("full_name")
      .eq("id", studentId)
      .maybeSingle<{ full_name: string | null }>(),
    // Reflections are private to the student. Other roles get an empty
    // list here — we intentionally don't expose raw reflections to
    // counselors or parents.
    profile.role === "student"
      ? db
          .from("meeting_reflections")
          .select("*")
          .eq("student_id", studentId)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as MeetingReflection[], error: null }),
    db
      .from("meeting_topics")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
    db.from("profiles").select("id, full_name, email, role"),
  ]);

  if (meetingsRes.error) throw meetingsRes.error;
  if ("error" in reflectionsRes && reflectionsRes.error)
    throw reflectionsRes.error;
  if (topicsRes.error) throw topicsRes.error;

  // Small id -> {name, role} map so we can show "added by Jessica" chips.
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
        <MeetingsClient
          profile={profile}
          studentId={studentId}
          meetings={(meetingsRes.data ?? []) as Meeting[]}
          reflections={(reflectionsRes.data ?? []) as MeetingReflection[]}
          topics={(topicsRes.data ?? []) as MeetingTopic[]}
          creators={creators}
          initialMeetingId={searchParams.meeting ?? null}
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

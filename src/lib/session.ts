import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";
import { createSupabaseAdminClient } from "./supabase/admin";
import type { Profile, SessionContext } from "@/types/db";

// Loads the currently-signed-in user's profile, bouncing to /sign-in
// if not signed in. Does NOT check approval status — pages may want to
// route pending users to /pending instead of blocking outright.
export async function requireProfile(): Promise<Profile> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  if (error) throw error;
  if (!profile) {
    // Profile row should have been created at signup. Signal by logging out.
    await supabase.auth.signOut();
    redirect("/sign-in?error=no_profile");
  }
  return profile;
}

// Full gate: signed in + approved. Bounces to /pending otherwise.
export async function requireApproved(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.status !== "approved") redirect("/pending");
  return profile;
}

// Resolves the student whose plan this user is looking at.
// For iteration 1 we support a single student per supporter — if there's
// exactly one support_links row, we use that student. Students themselves
// resolve to their own id. Returns null if unlinked (e.g. fresh counselor
// that the manager hasn't linked yet).
export async function loadSession(): Promise<SessionContext> {
  const profile = await requireApproved();

  if (profile.role === "student") {
    return { profile, studentId: profile.id };
  }

  // Use the service-role client for the lookup: support_links is readable by
  // the user anyway, but this is simpler and cheaper than a second query.
  const admin = createSupabaseAdminClient();

  if (profile.role === "manager") {
    // Manager defaults to the first approved student in the system.
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "student")
      .eq("status", "approved")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{ id: string }>();
    return { profile, studentId: data?.id ?? null };
  }

  const { data } = await admin
    .from("support_links")
    .select("student_id")
    .eq("supporter_id", profile.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ student_id: string }>();

  return { profile, studentId: data?.student_id ?? null };
}

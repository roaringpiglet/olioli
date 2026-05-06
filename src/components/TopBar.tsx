import { getTranslations } from "next-intl/server";
import { SignOutButton } from "./SignOutButton";
import { TopNav } from "./TopNav";
import { roleLabel } from "@/lib/permissions";
import type { Profile } from "@/types/db";

interface Props {
  profile: Profile;
  studentName?: string | null;
}

export async function TopBar({ profile, studentName }: Props) {
  const t = await getTranslations();
  const displayName = profile.full_name ?? profile.email;
  return (
    <header className="bg-white border-b border-ink-200">
      <div className="max-w-6xl mx-auto px-6 pt-4 pb-0 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
            {t("app.brand")}
            {studentName ? ` · ${studentName}` : ""}
          </div>
          <div className="text-sm text-ink-900 mt-0.5 font-medium truncate">
            {displayName}{" "}
            <span className="chip bg-ink-100 text-ink-600 ml-1">
              {roleLabel[profile.role]}
            </span>
          </div>
        </div>
        <SignOutButton>{t("app.signOut")}</SignOutButton>
      </div>
      <div className="max-w-6xl mx-auto px-6">
        <TopNav />
      </div>
    </header>
  );
}

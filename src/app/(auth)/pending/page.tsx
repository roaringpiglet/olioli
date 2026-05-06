import { getTranslations } from "next-intl/server";
import { requireProfile } from "@/lib/session";
import { SignOutButton } from "@/components/SignOutButton";

export default async function PendingPage() {
  const profile = await requireProfile();
  const approved = profile.status === "approved";
  const rejected = profile.status === "rejected";
  const t = await getTranslations();

  const heading = approved
    ? "你已通过审批"
    : rejected
      ? "申请被拒绝"
      : t("auth.pending.title");
  const body = approved
    ? "刷新页面即可进入主页。"
    : rejected
      ? "管理者拒绝了这次申请。如果你认为是误会，请直接与管理者联系。"
      : t("auth.pending.body");

  return (
    <div className="text-sm space-y-3">
      <h2 className="text-base font-semibold text-ink-900">{heading}</h2>
      <p className="text-ink-600">{body}</p>
      <div className="pt-2 flex items-center gap-2">
        {approved && (
          <a href="/" className="btn btn-primary">
            {t("common.next")}
          </a>
        )}
        <SignOutButton className="btn btn-ghost">
          {t("auth.pending.signOut")}
        </SignOutButton>
      </div>
    </div>
  );
}

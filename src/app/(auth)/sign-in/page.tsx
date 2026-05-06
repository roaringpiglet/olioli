import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SignInForm } from "./SignInForm";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const t = await getTranslations("auth.signIn");
  const error =
    searchParams.error === "no_profile"
      ? "未能加载你的档案，请重新注册或联系管理者。"
      : undefined;
  return (
    <div>
      <h2 className="text-base font-semibold text-ink-900">{t("title")}</h2>
      <p className="text-xs text-ink-600 mt-1 mb-4">{t("subtitle")}</p>
      <SignInForm initialError={error} />
      <p className="text-xs text-ink-600 mt-4 text-center">
        {t("noAccount")}{" "}
        <Link className="text-brand-600 hover:underline" href="/sign-up">
          {t("goSignUp")}
        </Link>
      </p>
    </div>
  );
}

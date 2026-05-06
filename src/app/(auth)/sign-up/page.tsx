import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SignUpForm } from "./SignUpForm";

export default async function SignUpPage() {
  const t = await getTranslations("auth.signUp");
  return (
    <div>
      <h2 className="text-base font-semibold text-ink-900">{t("title")}</h2>
      <p className="text-xs text-ink-600 mt-1 mb-4">{t("subtitle")}</p>
      <SignUpForm />
      <p className="text-xs text-ink-600 mt-4 text-center">
        {t("haveAccount")}{" "}
        <Link className="text-brand-600 hover:underline" href="/sign-in">
          {t("goSignIn")}
        </Link>
      </p>
    </div>
  );
}

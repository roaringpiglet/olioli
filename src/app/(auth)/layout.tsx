import { getTranslations } from "next-intl/server";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("app");
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-ink-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold">
            {t("brand")}
          </div>
          <h1 className="text-lg font-semibold text-ink-900 mt-1">
            规划 · 反思 · 成为
          </h1>
        </div>
        <div className="card p-6">{children}</div>
      </div>
    </div>
  );
}

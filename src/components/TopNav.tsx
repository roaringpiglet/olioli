"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const TABS = [
  { href: "/", key: "dashboard" },
  { href: "/timeline", key: "timeline" },
  { href: "/meetings", key: "meetings" },
  { href: "/growth", key: "growth" },
] as const;

export function TopNav() {
  const pathname = usePathname() || "/";
  const t = useTranslations("nav");
  return (
    <nav className="flex gap-1 -mb-px" aria-label={t("dashboard")}>
      {TABS.map((tab) => {
        const active =
          tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              "px-3 py-2 text-sm font-medium border-b-2 transition-colors " +
              (active
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-ink-500 hover:text-ink-800 hover:border-ink-200")
            }
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}

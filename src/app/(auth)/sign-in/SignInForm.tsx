"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignInForm({ initialError }: { initialError?: string }) {
  const t = useTranslations("auth.signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setErr(translateAuthError(error.message, t));
        return;
      }
      router.replace("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label">{t("email")}</label>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>
      <div>
        <label className="label">{t("password")}</label>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      {err && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2.5 py-2">
          {err}
        </div>
      )}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}

// Supabase returns English auth error messages. Map the most common one
// (invalid credentials) to our Chinese copy; surface anything else as-is
// so we don't silently mask unexpected errors.
function translateAuthError(
  message: string,
  t: (key: string) => string
): string {
  if (/invalid login credentials/i.test(message)) return t("wrongCreds");
  return message;
}

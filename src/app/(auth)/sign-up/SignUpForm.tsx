"use client";
import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";

type Role = "counselor" | "student" | "parent";

export function SignUpForm() {
  const t = useTranslations("auth.signUp");
  const tRole = useTranslations("roles");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [supportEmail, setSupportEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          password,
          role,
          requestedStudentEmail:
            role !== "student" && supportEmail ? supportEmail : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json.error ?? "注册失败，请稍后再试。");
        return;
      }
      setOk(true);
    } finally {
      setBusy(false);
    }
  };

  if (ok) {
    return (
      <div className="text-sm text-ink-900 space-y-2">
        <p className="font-medium">{t("success")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label">{t("fullName")}</label>
        <input
          className="input"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={t("fullNamePlaceholder")}
          required
          autoComplete="name"
        />
      </div>
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
          minLength={8}
          required
          autoComplete="new-password"
        />
        <p className="text-[11px] text-ink-400 mt-1">{t("passwordHint")}</p>
      </div>
      <div>
        <label className="label">{t("role")}</label>
        <select
          className="input"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          <option value="student">{tRole("student")}</option>
          <option value="counselor">{tRole("counselor")}</option>
          <option value="parent">{tRole("parent")}</option>
        </select>
      </div>
      {role !== "student" && (
        <div>
          <label className="label">{t("studentEmail")}</label>
          <input
            className="input"
            type="email"
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
            placeholder="student@example.com"
          />
          <p className="text-[11px] text-ink-400 mt-1">
            {t("studentEmailHint")}
          </p>
        </div>
      )}
      {err && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2.5 py-2">
          {err}
        </div>
      )}
      <button
        type="submit"
        className="btn btn-primary w-full"
        disabled={busy}
      >
        {busy ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { useI18n } from "@/lib/i18n/client";

type FieldErrors = Record<string, string[]>;

/**
 * Session notices are keyed by code and rendered from the active
 * dictionary. Unknown codes collapse to the expired notice.
 */
const NOTICE_KEYS: Record<string, string> = {
  expired: "auth.noticeExpired",
  inactive: "auth.noticeInactive",
  unavailable: "auth.noticeUnavailable",
  "logout-unconfirmed": "auth.noticeLogoutUnconfirmed",
};

export function LoginForm({ notice }: { notice: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // State stores dictionary KEYS, never translated strings: a locale switch
  // keeps this client state across router.refresh(), and every message is
  // re-translated at render in the active language.
  const [fieldErrorKeys, setFieldErrorKeys] = useState<FieldErrors>({});
  const [formErrorKey, setFormErrorKey] = useState<string | null>(
    notice ? (NOTICE_KEYS[notice] ?? NOTICE_KEYS.expired) : null,
  );
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrorKeys({});
    setFormErrorKey(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => null)) as {
        message?: string;
        code?: string;
        errors?: FieldErrors;
      } | null;

      if (res.ok) {
        router.replace("/");
        router.refresh();
        return;
      }

      // Messages are chosen by status/code from the active dictionary.
      // Server text is never rendered, so raw backend errors cannot reach
      // the user in either language.
      if (res.status === 422) {
        const fields: FieldErrors = {};
        if (data?.errors && typeof data.errors === "object") {
          for (const field of ["email", "password"] as const) {
            if (Array.isArray(data.errors[field]) && data.errors[field].length > 0) {
              fields[field] = ["auth.errorFieldInvalid"];
            }
          }
        }
        setFieldErrorKeys(fields);
        setFormErrorKey("auth.errorReview");
      } else if (res.status === 403) {
        setFormErrorKey(
          data?.code === "USER_INACTIVE" || data?.code === "COMPANY_INACTIVE"
            ? "auth.noticeInactive"
            : "auth.errorAccessDenied",
        );
      } else if (res.status === 429) {
        setFormErrorKey("auth.errorRateLimited");
      } else if (res.status === 502) {
        setFormErrorKey("auth.errorUnavailable");
      } else {
        setFormErrorKey("auth.errorFailed");
      }
    } catch {
      setFormErrorKey("auth.errorNetwork");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {formErrorKey && <Alert message={t(formErrorKey)} />}

      <Input
        label={t("auth.workEmail")}
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldErrorKeys.email?.[0] ? t(fieldErrorKeys.email[0]) : undefined}
        placeholder="name@company.com"
        dir="ltr"
        className="text-start"
      />

      <div className="flex flex-col gap-1.5">
        <div className="relative">
          <Input
            label={t("auth.password")}
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrorKeys.password?.[0] ? t(fieldErrorKeys.password[0]) : undefined}
            placeholder={t("auth.passwordPlaceholder")}
            className="pe-16"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            className="absolute end-3 bottom-2.5 text-xs font-semibold text-brand-strong hover:text-brand-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent dark:hover:text-brand-support"
          >
            {showPassword ? t("common.hide") : t("common.show")}
          </button>
        </div>
      </div>

      <Button type="submit" loading={loading} className="w-full">
        {t("auth.signIn")}
      </Button>
    </form>
  );
}

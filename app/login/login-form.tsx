"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

type FieldErrors = Record<string, string[]>;

const NOTICE_TEXT: Record<string, string> = {
  expired: "Your session has expired. Please sign in again.",
  inactive: "Your account or company is inactive. Please contact your administrator.",
  unavailable: "The authentication service is unavailable. Please try again later.",
  "logout-unconfirmed":
    "Signed out on this device, but the server could not confirm token revocation.",
};

export function LoginForm({ notice }: { notice: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(
    notice ? (NOTICE_TEXT[notice] ?? NOTICE_TEXT.expired) : null,
  );
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
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
        errors?: FieldErrors;
      } | null;

      if (res.ok) {
        router.replace("/");
        router.refresh();
        return;
      }

      if (res.status === 422 && data?.errors) {
        setFieldErrors(data.errors);
        setFormError(data.message ?? "Please review the highlighted fields.");
      } else if (res.status === 429) {
        setFormError("Too many attempts. Please wait a moment and try again.");
      } else if (res.status === 502) {
        setFormError("The authentication service is unavailable. Please try again later.");
      } else {
        setFormError(data?.message ?? "Sign in failed. Please try again.");
      }
    } catch {
      setFormError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {formError && <Alert message={formError} />}

      <Input
        label="Work email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldErrors.email?.[0]}
        placeholder="name@company.com"
      />

      <div className="flex flex-col gap-1.5">
        <div className="relative">
          <Input
            label="Password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password?.[0]}
            placeholder="Your password"
            className="pr-16"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            className="absolute bottom-2.5 right-3 text-xs font-semibold text-brand-strong hover:text-brand-accent dark:hover:text-brand-support focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <Button type="submit" loading={loading} className="w-full">
        Sign in
      </Button>
    </form>
  );
}

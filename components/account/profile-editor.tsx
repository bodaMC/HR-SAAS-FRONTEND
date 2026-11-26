"use client";

/** My Profile editor: the only self-service edits are the phone number and the picture. */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { failureKey, readFailureCode } from "@/lib/api-errors";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { TextField } from "@/components/ui/form-controls";
import { Avatar } from "@/components/account/avatar";

export function ProfileEditor({ name, phone, hasPicture, pictureVersion }: { name: string; phone: string; hasPicture: boolean; pictureVersion: number | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const [value, setValue] = useState(phone);
  const [pending, setPending] = useState(false);
  const [picPending, setPicPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [picError, setPicError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const savePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true); setError(null); setFieldError(null); setSaved(false);
    try {
      const res = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: value.trim() === "" ? null : value.trim() }) });
      if (res.ok) { setSaved(true); router.refresh(); return; }
      const body = await res.json().catch(() => null);
      if (res.status === 422) { setFieldError(t("forms.errors.invalid")); return; }
      setError(failureKey(res.status, readFailureCode(body), "forms.forbidden", "forms.submitError"));
    } catch {
      setError("forms.unavailable");
    } finally {
      setPending(false);
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file || picPending) return;
    setPicPending(true); setPicError(null);
    try {
      const fd = new FormData();
      fd.set("picture", file);
      const res = await fetch("/api/profile/picture", { method: "POST", body: fd });
      if (res.ok) { router.refresh(); return; }
      const body = (await res.json().catch(() => null)) as { errors?: { picture?: string[] } } | null;
      const code = body?.errors?.picture?.[0];
      setPicError(res.status === 422 ? t(`myProfile.picture.errors.${code === "image_too_large" ? "image_too_large" : "image_invalid"}`) : t(failureKey(res.status, readFailureCode(body), "forms.forbidden", "forms.submitError")));
    } catch {
      setPicError(t("forms.unavailable"));
    } finally {
      setPicPending(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async () => {
    if (picPending) return;
    setPicPending(true); setPicError(null);
    try {
      const res = await fetch("/api/profile/picture", { method: "DELETE" });
      if (res.ok) { router.refresh(); return; }
      setPicError(t(failureKey(res.status, readFailureCode(await res.json().catch(() => null)), "forms.forbidden", "forms.submitError")));
    } catch {
      setPicError(t("forms.unavailable"));
    } finally {
      setPicPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface p-5" data-testid="profile-picture-section">
        <h2 className="text-xs font-semibold tracking-wider text-foreground-muted uppercase">{t("myProfile.picture.title")}</h2>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Avatar src={hasPicture ? `/api/profile/picture?v=${pictureVersion ?? 0}` : null} name={name} size={88} />
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} id="picture-file" data-testid="picture-file" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
              <Button variant="ghost" onClick={() => fileRef.current?.click()} loading={picPending} data-testid="picture-upload">
                <Camera className="h-4 w-4" aria-hidden="true" />
                {hasPicture ? t("myProfile.picture.replace") : t("myProfile.picture.upload")}
              </Button>
              {hasPicture ? (
                <Button variant="ghost" onClick={remove} disabled={picPending} data-testid="picture-remove">
                  <Trash2 className="h-4 w-4 text-danger" aria-hidden="true" />
                  <span className="text-danger">{t("myProfile.picture.remove")}</span>
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-foreground-muted">{t("myProfile.picture.hint")}</p>
            {picError ? <p role="alert" data-testid="picture-error" className="text-xs text-danger">{picError}</p> : null}
          </div>
        </div>
      </section>
      <form onSubmit={savePhone} className="rounded-xl border border-border bg-surface p-5" data-testid="profile-phone-form">
        {error ? <Alert message={t(error)} /> : null}
        <div className="max-w-sm">
          <TextField id="profile-phone" label={t("myProfile.phone")} value={value} onChange={(v) => { setValue(v); setSaved(false); }} maxLength={30} error={fieldError} disabled={pending} dir="ltr" />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" loading={pending} data-testid="profile-phone-save">{t("myProfile.save")}</Button>
          {saved ? <span role="status" data-testid="profile-phone-saved" className="text-sm text-foreground-muted">{t("myProfile.saved")}</span> : null}
        </div>
      </form>
    </div>
  );
}

"use client";

/** Profile page owner/admin actions: edit link + delete with confirm. */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { failureKey, readFailureCode, type FailureCode } from "@/lib/api-errors";
import { useI18n } from "@/lib/i18n/client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function EmployeeActions({ id, name }: { id: number; name: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  /* Fatal state holds a dictionary KEY, not a translated string, so the
   * rendered message follows the active language. */
  const fatalKey = (status: number, code: FailureCode | null): string =>
    failureKey(status, code, "forms.forbidden", "forms.submitError");

  const confirmDelete = async () => {
    if (pending) return;
    setPending(true);
    setFatal(null);
    try {
      const res = await fetch(`/api/employees/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/employees");
        router.refresh();
        return;
      }
      setFatal(fatalKey(res.status, readFailureCode(await res.json().catch(() => null))));
    } catch {
      setFatal("forms.unavailable");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Link
        href={`/employees/${id}/edit`}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-5 text-sm font-semibold text-foreground hover:bg-surface-muted"
      >
        <Pencil className="h-4 w-4" aria-hidden="true" />
        {t("profile.edit")}
      </Link>
      <Button variant="ghost" onClick={() => setConfirming(true)} data-testid="employee-delete">
        <Trash2 className="h-4 w-4 text-danger" aria-hidden="true" />
        <span className="text-danger">{t("profile.deleteTitle")}</span>
      </Button>
      <Modal
        open={confirming}
        title={t("profile.deleteTitle")}
        onClose={() => !pending && setConfirming(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              {t("forms.cancel")}
            </Button>
            <Button onClick={confirmDelete} loading={pending} data-testid="employee-delete-confirm">
              {t("profile.deleteTitle")}
            </Button>
          </>
        }
      >
        {fatal ? <Alert message={t(fatal)} /> : null}
        <p className="mt-2 text-sm text-foreground">
          {t("profile.deleteConfirm", { name })}
        </p>
      </Modal>
    </div>
  );
}

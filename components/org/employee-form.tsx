"use client";

/**
 * Employee create/edit form (Phase 3). Only form-request-validated fields
 * are offered and sent (never team_leader_id, is_disabled, insurance_years,
 * is_* flags, or company_id). user_id has no selector because Phase 3
 * exposes no user-directory endpoint; the field stays unset (nullable in
 * the contract).
 * Manager options exclude the employee themself and their reporting chain
 * (client-side UX mirror of the backend's Rule::notIn cycle prevention;
 * the backend remains the authority). Field errors arrive as app-owned
 * codes and render through the dictionary; duplicate submits are blocked.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { failureKey, readFailureCode, type FailureCode } from "@/lib/api-errors";
import { nationalIdFormatOk, normalizeNationalId } from "@/lib/national-id";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { TextField, SelectField } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/alert";
import type { ApiDepartment, ApiEmployee } from "@/lib/types";

interface ManagerOption {
  id: number;
  label: string;
  manager_id: number | null;
}

interface Props {
  mode: "create" | "edit";
  employee?: ApiEmployee;
  departments: ApiDepartment[];
  jobTitles: ApiDepartment[];
  managers: ManagerOption[];
}

interface FormState {
  employee_number: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  gender: string;
  national_id: string;
  hire_date: string;
  termination_date: string;
  employment_status: string;
  department_id: string;
  job_title_id: string;
  manager_id: string;
}

const STATUS_VALUES = ["active", "on_leave", "suspended", "terminated"];
const GENDER_VALUES = ["male", "female"];

function initialFrom(e: ApiEmployee | undefined): FormState {
  return {
    employee_number: e?.employee_number ?? "",
    first_name: e?.first_name ?? "",
    last_name: e?.last_name ?? "",
    email: e?.email ?? "",
    phone: e?.phone ?? "",
    date_of_birth: e?.date_of_birth ?? "",
    gender: GENDER_VALUES.includes(e?.gender ?? "") ? (e?.gender ?? "") : "",
    national_id: e?.national_id ?? "",
    hire_date: e?.hire_date ?? "",
    termination_date: e?.termination_date ?? "",
    employment_status: e?.employment_status ?? "active",
    department_id: e?.department_id != null ? String(e.department_id) : "",
    job_title_id: e?.job_title_id != null ? String(e.job_title_id) : "",
    manager_id: e?.manager_id != null ? String(e.manager_id) : "",
  };
}

export function EmployeeForm({ mode, employee, departments, jobTitles, managers }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initialFrom(employee));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [fatal, setFatal] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);
  /* The page-level alert sits above the form; after submitting from the
   * bottom the user would not see it, so bring it into view. */
  useEffect(() => {
    if (fatal) alertRef.current?.scrollIntoView({ block: "center" });
  }, [fatal]);

  /* Exclude self and everyone whose manager chain passes through self
   * (backend enforces Rule::notIn(self + subordinates) with a 422). */
  const managerOptions = useMemo(() => {
    const selfId = employee?.id;
    const excluded = new Set<number>();
    if (selfId != null) {
      excluded.add(selfId);
      let changed = true;
      while (changed) {
        changed = false;
        for (const m of managers) {
          if (m.manager_id != null && excluded.has(m.manager_id) && !excluded.has(m.id)) {
            excluded.add(m.id);
            changed = true;
          }
        }
      }
    }
    return managers.filter((m) => !excluded.has(m.id));
  }, [managers, employee?.id]);

  /* Fatal state holds a dictionary KEY, not a translated string, so the
   * rendered message follows the active language without resubmitting. */
  const fatalKey = (status: number, code: FailureCode | null): string =>
    failureKey(status, code, "employeeForm.forbidden", "employeeForm.submitError");

  const set = <K extends keyof FormState>(key: K, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (pending) return;
    // Canonical national ID (Arabic/Western digits) with immediate format
    // feedback; the backend still validates and enforces uniqueness.
    const nid = normalizeNationalId(form.national_id);
    const unchangedLegacy = mode === "edit" && nid !== "" && nid === normalizeNationalId(employee?.national_id ?? "");
    if (!unchangedLegacy && !nationalIdFormatOk(nid)) {
      setErrors({ national_id: ["national_id_format"] });
      setFatal(null);
      document.getElementById("f-national-id")?.focus();
      return;
    }
    setPending(true);
    setErrors({});
    setFatal(null);
    const payload: Record<string, unknown> = {
      employee_number: form.employee_number.trim(),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() === "" ? null : form.phone.trim(),
      date_of_birth: form.date_of_birth === "" ? null : form.date_of_birth,
      // Keep legacy or undisclosed values unchanged when editing other fields.
      // A new explicit selection replaces the old value; never guess a gender.
      ...(mode === "edit" && form.gender === "" &&
      (employee?.gender === undefined ||
        (employee.gender !== null && !GENDER_VALUES.includes(employee.gender)))
        ? {}
        : { gender: form.gender === "" ? null : form.gender }),
      national_id: nid === "" ? null : nid,
      hire_date: form.hire_date === "" ? null : form.hire_date,
      termination_date: form.termination_date === "" ? null : form.termination_date,
      employment_status: form.employment_status,
      department_id: form.department_id === "" ? null : Number(form.department_id),
      job_title_id: form.job_title_id === "" ? null : Number(form.job_title_id),
      manager_id: form.manager_id === "" ? null : Number(form.manager_id),
    };
    try {
      const res = await fetch(
        mode === "create" ? "/api/employees" : `/api/employees/${employee?.id}`,
        {
          method: mode === "create" ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as { data?: { id?: number } } | null;
        const id = mode === "create" ? body?.data?.id : employee?.id;
        router.push(id != null ? `/employees/${id}` : "/employees");
        router.refresh();
        return;
      }
      if (res.status === 422) {
        const body = (await res.json().catch(() => null)) as
          | { errors?: Record<string, string[]> }
          | null;
        const errs = body?.errors && typeof body.errors === "object" ? body.errors : {};
        setErrors(errs);
        /* A 422 with no known field errors must still surface a generic
         * localized validation message instead of failing silently. */
        if (Object.keys(errs).length === 0) setFatal("forms.validation");
        return;
      }
      setFatal(fatalKey(res.status, readFailureCode(await res.json().catch(() => null))));
    } catch {
      setFatal("forms.unavailable");
    } finally {
      setPending(false);
    }
  };

  const fieldError = (f: string) =>
    errors[f]?.[0] ? t(`forms.errors.${errors[f][0]}`) : null;

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-foreground">
        {mode === "create" ? t("employeeForm.createTitle") : t("employeeForm.editTitle")}
      </h1>
      {fatal ? (
        <div className="mt-4" ref={alertRef}>
          <Alert message={t(fatal)} />
        </div>
      ) : null}

      <section className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-xs font-semibold tracking-wider text-foreground-muted uppercase">
          {t("employeeForm.identitySection")}
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            id="f-employee-number"
            label={t("employeeForm.employeeNumber")}
            value={form.employee_number}
            onChange={(v) => set("employee_number", v)}
            required
            maxLength={50}
            error={fieldError("employee_number")}
            disabled={pending}
            dir="ltr"
          />
          <TextField
            id="f-email"
            label={t("employeeForm.email")}
            type="email"
            value={form.email}
            onChange={(v) => set("email", v)}
            required
            maxLength={255}
            error={fieldError("email")}
            disabled={pending}
            dir="ltr"
          />
          <TextField
            id="f-first-name"
            label={t("employeeForm.firstName")}
            value={form.first_name}
            onChange={(v) => set("first_name", v)}
            required
            maxLength={100}
            error={fieldError("first_name")}
            disabled={pending}
          />
          <TextField
            id="f-last-name"
            label={t("employeeForm.lastName")}
            value={form.last_name}
            onChange={(v) => set("last_name", v)}
            required
            maxLength={100}
            error={fieldError("last_name")}
            disabled={pending}
          />
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-xs font-semibold tracking-wider text-foreground-muted uppercase">
          {t("employeeForm.contactSection")}
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            id="f-phone"
            label={t("employeeForm.phone")}
            value={form.phone}
            onChange={(v) => set("phone", v)}
            maxLength={50}
            error={fieldError("phone")}
            disabled={pending}
            dir="ltr"
          />
          <TextField
            id="f-date-of-birth"
            label={t("employeeForm.dateOfBirth")}
            type="date"
            value={form.date_of_birth}
            onChange={(v) => set("date_of_birth", v)}
            error={fieldError("date_of_birth")}
            disabled={pending}
            dir="ltr"
          />
          <SelectField
            id="f-gender"
            label={t("employeeForm.gender")}
            value={form.gender}
            onChange={(v) => set("gender", v)}
            options={[
              { value: "", label: "—" },
              ...GENDER_VALUES.map((g) => ({ value: g, label: t(`employeeForm.genders.${g}`) })),
            ]}
            error={fieldError("gender")}
            disabled={pending}
          />
          <TextField
            id="f-national-id"
            label={t("employeeForm.nationalId")}
            value={form.national_id}
            onChange={(v) => set("national_id", v)}
            maxLength={100}
            error={fieldError("national_id")}
            disabled={pending}
            dir="ltr"
          />
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-xs font-semibold tracking-wider text-foreground-muted uppercase">
          {t("employeeForm.employmentSection")}
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            id="f-status"
            label={t("employeeForm.employmentStatus")}
            value={form.employment_status}
            onChange={(v) => set("employment_status", v)}
            options={STATUS_VALUES.map((s) => ({
              value: s,
              label: t(`employees.statuses.${s}`),
            }))}
            error={fieldError("employment_status")}
            disabled={pending}
          />
          <TextField
            id="f-hire-date"
            label={t("employeeForm.hireDate")}
            type="date"
            value={form.hire_date}
            onChange={(v) => set("hire_date", v)}
            error={fieldError("hire_date")}
            disabled={pending}
            dir="ltr"
          />
          <TextField
            id="f-termination-date"
            label={t("employeeForm.terminationDate")}
            type="date"
            value={form.termination_date}
            onChange={(v) => set("termination_date", v)}
            error={fieldError("termination_date")}
            disabled={pending}
            dir="ltr"
          />
          <SelectField
            id="f-department"
            label={t("employeeForm.department")}
            value={form.department_id}
            onChange={(v) => set("department_id", v)}
            options={[
              { value: "", label: t("employeeForm.noneOption") },
              ...departments.map((d) => ({ value: String(d.id), label: d.name })),
            ]}
            error={fieldError("department_id")}
            disabled={pending}
          />
          <SelectField
            id="f-job-title"
            label={t("employeeForm.jobTitle")}
            value={form.job_title_id}
            onChange={(v) => set("job_title_id", v)}
            options={[
              { value: "", label: t("employeeForm.noneOption") },
              ...jobTitles.map((j) => ({ value: String(j.id), label: j.name })),
            ]}
            error={fieldError("job_title_id")}
            disabled={pending}
          />
          <SelectField
            id="f-manager"
            label={t("employeeForm.manager")}
            value={form.manager_id}
            onChange={(v) => set("manager_id", v)}
            options={[
              { value: "", label: t("employeeForm.noneOption") },
              ...managerOptions.map((m) => ({ value: String(m.id), label: m.label })),
            ]}
            error={fieldError("manager_id")}
            disabled={pending}
          />
        </div>
      </section>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>
          {t("employeeForm.cancel")}
        </Button>
        <Button onClick={submit} loading={pending} data-testid="employee-submit">
          {mode === "create" ? t("employeeForm.create") : t("employeeForm.save")}
        </Button>
      </div>
    </div>
  );
}

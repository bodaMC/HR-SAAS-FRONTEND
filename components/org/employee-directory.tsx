"use client";

/**
 * Employee directory filters (Phase 3.1, BUG-004).
 *
 * State lives in the URL (single source of truth, shareable, survives
 * profile -> back). Selects apply immediately; the search box is debounced
 * (350 ms). Every apply builds the URL from the LATEST control state and
 * navigates inside a transition: a newer navigation supersedes an older one,
 * so a slow earlier response can never replace newer results. While pending
 * the list is dimmed and announced (aria-busy); the controls stay usable.
 * The server page validates every parameter and never converts an API
 * failure into an empty list. No client-side filtering exists here.
 */
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";

export interface FilterValues {
  search: string;
  department_id: string;
  job_title_id: string;
  manager_id: string;
  employment_status: string;
  /** Phase 3.3: "" = current employees (the backend default), "former" or "all". */
  scope: string;
  employment_type: string;
  is_trainee: string;
}

interface Option {
  id: string;
  name: string;
}

const STATUSES = ["active", "on_leave", "suspended", "terminated"];
const DEBOUNCE_MS = 350;
const SELECT_CLASS =
  "w-full max-w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground sm:w-auto";

export function EmployeeDirectory({
  initial,
  departments,
  jobTitles,
  managers,
  children,
}: {
  initial: FilterValues;
  departments: Option[];
  jobTitles: Option[];
  managers: Option[];
  children: ReactNode;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [values, setValues] = useState<FilterValues>(initial);
  const [pending, startTransition] = useTransition();
  const latest = useRef<FilterValues>(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNav = useRef<string>(JSON.stringify(initial));

  const hasFilters = Object.values(values).some((v) => v !== "");

  const navigate = (v: FilterValues) => {
    const qs = new URLSearchParams();
    (Object.keys(v) as (keyof FilterValues)[]).forEach((k) => {
      const val = k === "search" ? v[k].trim() : v[k];
      if (val) qs.set(k, val);
    });
    lastNav.current = JSON.stringify(v);
    const url = qs.size > 0 ? `${pathname}?${qs.toString()}` : pathname;
    startTransition(() => router.replace(url, { scroll: false }));
  };

  const change = (key: keyof FilterValues, value: string) => {
    const next = { ...latest.current, [key]: value };
    latest.current = next;
    setValues(next);
    if (timer.current) clearTimeout(timer.current);
    if (key === "search") {
      timer.current = setTimeout(() => navigate(latest.current), DEBOUNCE_MS);
    } else {
      navigate(next);
    }
  };

  const reset = () => {
    if (timer.current) clearTimeout(timer.current);
    const empty: FilterValues = {
      search: "",
      department_id: "",
      job_title_id: "",
      manager_id: "",
      employment_status: "",
      scope: "",
      employment_type: "",
      is_trainee: "",
    };
    latest.current = empty;
    setValues(empty);
    navigate(empty);
  };

  /* Adopt URL changes we did not make (browser back/forward, a link with
   * filters). Our own navigations are recognized by lastNav and ignored so
   * typing is never clobbered by an older server response. */
  const initialSig = JSON.stringify(initial);
  useEffect(() => {
    if (initialSig !== lastNav.current) {
      const v = JSON.parse(initialSig) as FilterValues;
      lastNav.current = initialSig;
      latest.current = v;
      setValues(v);
    }
  }, [initialSig]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const select = (
    name: keyof FilterValues,
    label: string,
    options: Option[],
    testId: string,
  ) => (
    <select
      name={name}
      value={values[name]}
      onChange={(e) => change(name, e.target.value)}
      aria-label={label}
      data-testid={testId}
      className={SELECT_CLASS}
    >
      <option value="">
        {label}: {t("employees.all")}
      </option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <form
        method="get"
        role="search"
        aria-label={t("employees.filtersGroup")}
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (timer.current) clearTimeout(timer.current);
          navigate(latest.current);
        }}
      >
        <div className="w-full sm:w-auto">
          <label htmlFor="f-search" className="sr-only">
            {t("employees.searchPlaceholder")}
          </label>
          <input
            id="f-search"
            type="search"
            name="search"
            value={values.search}
            maxLength={200}
            onChange={(e) => change("search", e.target.value)}
            placeholder={t("employees.searchPlaceholder")}
            className="w-full max-w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted sm:w-72"
          />
        </div>
        {select("department_id", t("employees.filterDepartment"), departments, "filter-department")}
        {select("job_title_id", t("employees.filterJobTitle"), jobTitles, "filter-job-title")}
        {select("manager_id", t("employees.filterManager"), managers, "filter-manager")}
        <select
          name="employment_status"
          value={values.employment_status}
          onChange={(e) => change("employment_status", e.target.value)}
          aria-label={t("employees.filterStatus")}
          data-testid="filter-status"
          className={SELECT_CLASS}
        >
          <option value="">
            {t("employees.filterStatus")}: {t("employees.all")}
          </option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`employees.statuses.${s}`)}
            </option>
          ))}
        </select>
        <select
          name="scope"
          value={values.scope}
          onChange={(e) => change("scope", e.target.value)}
          aria-label={t("employees.filterScope")}
          data-testid="filter-scope"
          className={SELECT_CLASS}
        >
          <option value="">{t("employees.scopes.current")}</option>
          <option value="former">{t("employees.scopes.former")}</option>
          <option value="all">{t("employees.scopes.all")}</option>
        </select>
        <select
          name="employment_type"
          value={values.employment_type}
          onChange={(e) => change("employment_type", e.target.value)}
          aria-label={t("employees.filterType")}
          data-testid="filter-type"
          className={SELECT_CLASS}
        >
          <option value="">{t("employees.filterType")}: {t("employees.all")}</option>
          {["full_time", "part_time", "contract"].map((s) => (
            <option key={s} value={s}>{t(`employeeForm.employmentTypes.${s}`)}</option>
          ))}
          <option value="none">{t("employees.typeNone")}</option>
        </select>
        <select
          name="is_trainee"
          value={values.is_trainee}
          onChange={(e) => change("is_trainee", e.target.value)}
          aria-label={t("employees.filterTrainee")}
          data-testid="filter-trainee"
          className={SELECT_CLASS}
        >
          <option value="">{t("employees.filterTrainee")}: {t("employees.traineeAny")}</option>
          <option value="1">{t("employees.traineeYes")}</option>
          <option value="0">{t("employees.traineeNo")}</option>
        </select>
        <button
          type="button"
          onClick={reset}
          disabled={!hasFilters}
          data-testid="filters-reset"
          className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("employees.resetFilters")}
        </button>
        <noscript>
          <button type="submit">{t("employees.applyFilters")}</button>
        </noscript>
        <span
          role="status"
          aria-live="polite"
          data-testid="filters-pending"
          className="text-xs text-foreground-muted"
        >
          {pending ? t("employees.updating") : ""}
        </span>
      </form>
      <div
        aria-busy={pending}
        data-pending={pending ? "true" : "false"}
        data-testid="employee-results"
        className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}
      >
        {children}
      </div>
    </>
  );
}

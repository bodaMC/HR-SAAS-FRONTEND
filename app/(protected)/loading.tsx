import { getI18n } from "@/lib/i18n/server";

/**
 * Loading fallback for protected pages (shown while the server validates
 * the session and fetches dashboard data). Pure skeleton, no fake data.
 */
export default async function Loading() {
  const { t } = await getI18n();
  return (
    <main
      className="flex-1 px-4 py-6 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label={t("dashboard.loading")}
    >
      <div
        className="mx-auto flex w-full max-w-6xl animate-pulse flex-col gap-6"
        data-testid="dashboard-loading"
      >
        <div className="space-y-2">
          <div className="h-7 w-56 rounded-lg bg-surface-muted" />
          <div className="h-4 w-72 rounded-lg bg-surface-muted" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-surface p-5">
              <div className="h-3 w-24 rounded bg-surface-muted" />
              <div className="mt-3 h-8 w-12 rounded bg-surface-muted" />
              <div className="mt-2 h-3 w-32 rounded bg-surface-muted" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-surface p-5">
              <div className="h-3 w-36 rounded bg-surface-muted" />
              {[0, 1, 2].map((j) => (
                <div key={j} className="mt-4 flex items-center justify-between gap-3">
                  <div className="space-y-2">
                    <div className="h-4 w-32 rounded bg-surface-muted" />
                    <div className="h-3 w-48 rounded bg-surface-muted" />
                  </div>
                  <div className="h-5 w-16 rounded-full bg-surface-muted" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

import "server-only";
import type { ApiResult } from "@/lib/server/api";

/** A synthetic empty collection for lookups the caller is not permitted to read: no request is made. */
export function emptyCollection<T>(): ApiResult<{ data: T[] }> {
  return { ok: true, status: 200, data: { data: [] }, retryAfter: null };
}

import type { NextRequest } from "next/server";
import { fetchLinkCandidates } from "@/lib/server/api";
import { failure, jsonNoStore } from "@/lib/server/account-bff";
import { readSessionCookie } from "@/lib/server/session";

/** Minimal Link picker data. Only id, name, email and the active flag cross to the browser; the backend decides eligibility. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) return jsonNoStore({ message: "not_found" }, 404);
  const token = readSessionCookie(req);
  if (!token) return jsonNoStore({ message: "unauthenticated" }, 401);
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  const r = await fetchLinkCandidates(token, id, q);
  if (!r.ok) return failure(r, []);
  const rows = Array.isArray(r.data?.data) ? (r.data.data as Record<string, unknown>[]) : [];
  const data = rows
    .filter((c) => typeof c.id === "number" && typeof c.email === "string")
    .map((c) => ({ id: c.id as number, name: typeof c.name === "string" ? c.name : "", email: c.email as string, is_active: c.is_active === true }));
  return jsonNoStore({ data }, 200);
}

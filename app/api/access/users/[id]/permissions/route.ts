import { NextResponse, type NextRequest } from "next/server";
import { fetchAccess } from "@/lib/server/api";
import { readSessionCookie } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Same-origin read of one account's effective permissions. Token stays server-side; only the permission codes cross. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = readSessionCookie(req);
  const h = { "Cache-Control": "no-store" };
  if (!token) return NextResponse.json({ message: "unauthenticated" }, { status: 401, headers: h });
  if (!/^[1-9]\d*$/.test(id)) return NextResponse.json({ message: "not_found" }, { status: 404, headers: h });
  const r = await fetchAccess<{ data?: { effective_permissions?: unknown } }>(token, `/users/${id}/permissions`);
  if (!r.ok) {
    const st = r.status === 401 || r.status === 403 || r.status === 404 ? r.status : 503;
    const msg = st === 401 ? "session_expired" : st === 403 ? "forbidden" : st === 404 ? "not_found" : "unavailable";
    return NextResponse.json({ message: msg }, { status: st, headers: h });
  }
  const perms = r.data?.data?.effective_permissions;
  if (!Array.isArray(perms) || !perms.every((p) => typeof p === "string")) {
    return NextResponse.json({ message: "unavailable" }, { status: 503, headers: h });
  }
  return NextResponse.json({ data: { effective_permissions: perms } }, { headers: h });
}

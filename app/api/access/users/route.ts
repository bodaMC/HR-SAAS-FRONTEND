import { NextResponse, type NextRequest } from "next/server";
import { fetchAccess } from "@/lib/server/api";
import { readSessionCookie } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Same-origin, tenant-scoped account directory page (server-side search and pagination). Token stays server-side. */
export async function GET(req: NextRequest) {
  const token = readSessionCookie(req);
  const h = { "Cache-Control": "no-store" };
  if (!token) return NextResponse.json({ message: "unauthenticated" }, { status: 401, headers: h });
  const sp = req.nextUrl.searchParams;
  const q = new URLSearchParams();
  const search = (sp.get("search") ?? "").trim().slice(0, 100);
  if (search) q.set("search", search);
  const page = Number(sp.get("page") ?? "1");
  const perPage = Number(sp.get("per_page") ?? "25");
  q.set("page", String(Number.isInteger(page) && page >= 1 && page <= 100000 ? page : 1));
  q.set("per_page", String(Number.isInteger(perPage) && perPage >= 1 && perPage <= 100 ? perPage : 25));
  const r = await fetchAccess<{ data?: unknown; meta?: unknown }>(token, `/users?${q.toString()}`);
  if (!r.ok) {
    const st = r.status === 401 || r.status === 403 ? r.status : 503;
    const msg = st === 401 ? "session_expired" : st === 403 ? "forbidden" : "unavailable";
    return NextResponse.json({ message: msg }, { status: st, headers: h });
  }
  const d = r.data;
  if (!d || !Array.isArray(d.data) || typeof d.meta !== "object" || d.meta === null) {
    return NextResponse.json({ message: "unavailable" }, { status: 503, headers: h });
  }
  return NextResponse.json({ data: d.data, meta: d.meta }, { headers: h });
}

import { NextResponse, type NextRequest } from "next/server";
import { jsonNoStore } from "@/lib/server/account-bff";
import { fetchPictureBytes } from "@/lib/server/api";
import { readSessionCookie } from "@/lib/server/session";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) return jsonNoStore({ message: "not_found" }, 404);
  const token = readSessionCookie(req);
  if (!token) return jsonNoStore({ message: "unauthenticated" }, 401);
  const pic = await fetchPictureBytes(token, `/employees/${id}/picture`);
  if (!pic) return jsonNoStore({ message: "not_found" }, 404);
  return new NextResponse(pic.bytes, { status: 200, headers: { "Content-Type": pic.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

import { NextResponse, type NextRequest } from "next/server";
import { failure, jsonNoStore } from "@/lib/server/account-bff";
import { fetchPictureBytes, mutateApi, uploadPicture } from "@/lib/server/api";
import { isSameOriginRequest, readSessionCookie } from "@/lib/server/session";

const MAX_BYTES = 2 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const token = readSessionCookie(req);
  if (!token) return jsonNoStore({ message: "unauthenticated" }, 401);
  const pic = await fetchPictureBytes(token, "/me/profile/picture");
  if (!pic) return jsonNoStore({ message: "not_found" }, 404);
  return new NextResponse(pic.bytes, { status: 200, headers: { "Content-Type": pic.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return jsonNoStore({ message: "untrusted_origin" }, 403);
  const token = readSessionCookie(req);
  if (!token) return jsonNoStore({ message: "unauthenticated" }, 401);
  let file: unknown;
  try {
    file = (await req.formData()).get("picture");
  } catch {
    return jsonNoStore({ message: "invalid_request" }, 400);
  }
  if (!(file instanceof Blob)) return jsonNoStore({ message: "invalid_request" }, 400);
  if (file.size > MAX_BYTES) return jsonNoStore({ message: "validation", errors: { picture: ["image_too_large"] } }, 422);
  const r = await uploadPicture(token, file, "upload");
  if (!r.ok) {
    if (r.status === 422) return jsonNoStore({ message: "validation", errors: { picture: ["image_invalid"] } }, 422);
    return failure(r, ["picture"]);
  }
  return jsonNoStore({ message: "ok" }, 200);
}

export async function DELETE(req: NextRequest) {
  if (!isSameOriginRequest(req)) return jsonNoStore({ message: "untrusted_origin" }, 403);
  const token = readSessionCookie(req);
  if (!token) return jsonNoStore({ message: "unauthenticated" }, 401);
  const r = await mutateApi<unknown>(token, "DELETE", "/me/profile/picture");
  if (!r.ok) return failure(r, []);
  return jsonNoStore({ message: "ok" }, 200);
}

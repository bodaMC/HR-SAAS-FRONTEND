import type { NextRequest } from "next/server";
import { handleChangePassword } from "@/lib/server/account-bff";
import { setSessionCookie } from "@/lib/server/session";

export async function POST(req: NextRequest) {
  return handleChangePassword(req, (res, token) => setSessionCookie(req, res, token));
}

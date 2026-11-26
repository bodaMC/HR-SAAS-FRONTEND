import type { NextRequest } from "next/server";
import { handleProfileUpdate } from "@/lib/server/account-bff";

export async function PUT(req: NextRequest) {
  return handleProfileUpdate(req);
}

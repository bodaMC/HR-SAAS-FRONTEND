import type { NextRequest } from "next/server";
import { ACCOUNT_ACTION_FIELDS, handleEmployeeLifecycle, jsonNoStore } from "@/lib/server/account-bff";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) return jsonNoStore({ message: "not_found" }, 404);
  return handleEmployeeLifecycle(req, `/employees/${id}/reactivate`, ACCOUNT_ACTION_FIELDS);
}

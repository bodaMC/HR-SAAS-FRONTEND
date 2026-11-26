import type { NextRequest } from "next/server";
import { ACCOUNT_CREATE_FIELDS, handleAccountMutation, jsonNoStore } from "@/lib/server/account-bff";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) return jsonNoStore({ message: "not_found" }, 404);
  return handleAccountMutation(req, `/employees/${id}/account`, ACCOUNT_CREATE_FIELDS, 201);
}

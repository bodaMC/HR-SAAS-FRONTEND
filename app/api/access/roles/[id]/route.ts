import type { NextRequest } from "next/server";
import { handleMutation } from "@/lib/server/bff";

const FIELDS = ["name", "name_ar", "description", "permissions"] as const;
const bad = (id: string) => !/^[1-9]\d*$/.test(id);

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleMutation(req, "PUT", bad(id) ? "/access/roles/__invalid__" : `/access/roles/${id}`, FIELDS, { rbacCodes: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleMutation(req, "DELETE", bad(id) ? "/access/roles/__invalid__" : `/access/roles/${id}`, FIELDS, { rbacCodes: true });
}

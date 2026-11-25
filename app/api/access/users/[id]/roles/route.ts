import type { NextRequest } from "next/server";
import { handleMutation } from "@/lib/server/bff";

const FIELDS = ["role_ids"] as const;

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const path = /^[1-9]\d*$/.test(id) ? `/access/users/${id}/roles` : "/access/users/__invalid__/roles";
  return handleMutation(req, "PUT", path, FIELDS, { rbacCodes: true });
}

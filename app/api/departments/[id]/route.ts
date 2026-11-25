import type { NextRequest } from "next/server";
import { handleMutation } from "@/lib/server/bff";

const FIELDS = ["name", "description", "is_active"] as const;

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) return handleMutation(req, "PUT", "/departments/__invalid__", FIELDS);
  return handleMutation(req, "PUT", `/departments/${id}`, FIELDS);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) return handleMutation(req, "DELETE", "/departments/__invalid__", FIELDS);
  return handleMutation(req, "DELETE", `/departments/${id}`, FIELDS);
}

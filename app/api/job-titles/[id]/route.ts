import type { NextRequest } from "next/server";
import { handleMutation } from "@/lib/server/bff";

const FIELDS = ["name", "description", "is_active"] as const;

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) return handleMutation(req, "PUT", "/job-titles/__invalid__", FIELDS);
  return handleMutation(req, "PUT", `/job-titles/${id}`, FIELDS);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) return handleMutation(req, "DELETE", "/job-titles/__invalid__", FIELDS);
  return handleMutation(req, "DELETE", `/job-titles/${id}`, FIELDS);
}

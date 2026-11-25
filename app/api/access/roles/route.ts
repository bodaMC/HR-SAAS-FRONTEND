import type { NextRequest } from "next/server";
import { handleMutation } from "@/lib/server/bff";

const FIELDS = ["name", "name_ar", "description", "permissions"] as const;

export async function POST(req: NextRequest) {
  return handleMutation(req, "POST", "/access/roles", FIELDS, { rbacCodes: true });
}

import type { NextRequest } from "next/server";
import { handleMutation } from "@/lib/server/bff";

const FIELDS = ["name", "description", "is_active"] as const;

export async function POST(req: NextRequest) {
  return handleMutation(req, "POST", "/job-titles", FIELDS);
}

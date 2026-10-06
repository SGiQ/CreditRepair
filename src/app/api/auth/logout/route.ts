import { endSession } from "@/lib/auth";
import { ok } from "@/lib/http";

export async function POST() {
  await endSession();
  return ok();
}

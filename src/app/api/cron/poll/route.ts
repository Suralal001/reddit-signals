import { NextResponse } from "next/server";
import { runPoll } from "@/lib/poll";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/poll  — Authorization: Bearer <CRON_SECRET>
 * Wire this to Vercel Cron (see vercel.json) or any external scheduler.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runPoll();
  return NextResponse.json(result, { status: result.errors.length ? 207 : 200 });
}

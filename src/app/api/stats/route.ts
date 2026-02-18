import { NextResponse } from "next/server";
import { getStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getStats();
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("GET /api/stats error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

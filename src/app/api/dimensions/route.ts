import { NextResponse } from "next/server";
import { getDimensions } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getDimensions();
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("GET /api/dimensions error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

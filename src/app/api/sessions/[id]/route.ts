import { NextRequest, NextResponse } from "next/server";
import { getSessionDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await getSessionDetail(id);
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("GET /api/sessions/[id] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

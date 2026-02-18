import { NextRequest, NextResponse } from "next/server";
import { getLogConversation } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await getLogConversation(id);
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("GET /api/logs/[id] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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

    if (!data.messages.length) {
      return new NextResponse("No messages found for this session.\n", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const jsonl = data.messages.map((m) => m.raw).join("\n") + "\n";

    return new NextResponse(jsonl, {
      headers: {
        "Content-Type": "application/jsonl; charset=utf-8",
        "Content-Disposition": `attachment; filename="${id}.jsonl"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("GET /api/logs/[id]/text error:", message);
    return new NextResponse(`Error: ${message}\n`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

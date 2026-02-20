import { NextRequest } from "next/server";
import { getNewSessionMessages } from "@/lib/queries";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 2000;
const PING_INTERVAL_MS = 10000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  let cursor = request.nextUrl.searchParams.get("after") ?? new Date(0).toISOString();

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };

      // Keepalive ping timer
      const pingTimer = setInterval(() => {
        enqueue("event: ping\ndata: {}\n\n");
      }, PING_INTERVAL_MS);

      // Poll loop
      const poll = async () => {
        while (!closed) {
          try {
            const messages = await getNewSessionMessages(sessionId, cursor);
            if (messages.length > 0) {
              cursor = messages[messages.length - 1].msg_timestamp;
              enqueue(`data: ${JSON.stringify(messages)}\n\n`);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            enqueue(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`);
          }
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        }
      };

      poll().catch(() => {});

      // Cleanup on abort
      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(pingTimer);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

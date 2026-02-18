import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /logs/<sessionId>.jsonl → /api/logs/<sessionId>/text
  const match = pathname.match(/^\/logs\/(.+)\.jsonl$/);
  if (match) {
    const sessionId = match[1];
    const url = request.nextUrl.clone();
    url.pathname = `/api/logs/${sessionId}/text`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/logs/:path*.jsonl",
};

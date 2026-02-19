import { NextRequest, NextResponse } from "next/server";
import { getStats } from "@/lib/queries";
import type { DashboardFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const filters: DashboardFilters = {};
    for (const key of ["project", "environment", "team", "developer"] as const) {
      const v = sp.get(key);
      if (v) filters[key] = v;
    }
    const data = await getStats(
      Object.keys(filters).length > 0 ? filters : undefined
    );
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("GET /api/stats error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

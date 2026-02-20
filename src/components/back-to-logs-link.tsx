"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { FILTER_KEYS } from "@/lib/use-global-filters";

export function BackToLogsLink() {
  const searchParams = useSearchParams();
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const v = searchParams.get(key);
    if (v) params.set(key, v);
  }
  const qs = params.toString();

  return (
    <Link
      href={`/logs${qs ? `?${qs}` : ""}`}
      className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to logs
    </Link>
  );
}

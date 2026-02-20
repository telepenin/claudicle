"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { DashboardFilters } from "@/lib/types";

export const FILTER_KEYS = ["project", "environment", "team", "developer"] as const;

export function useGlobalFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters: DashboardFilters = useMemo(() => {
    const f: DashboardFilters = {};
    for (const key of FILTER_KEYS) {
      const v = searchParams.get(key);
      if (v) f[key] = v;
    }
    return f;
  }, [searchParams]);

  const setFilter = useCallback(
    (key: (typeof FILTER_KEYS)[number], value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      const qs = params.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ""}`);
    },
    [searchParams, router, pathname]
  );

  const clearFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of FILTER_KEYS) {
      params.delete(key);
    }
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  }, [searchParams, router, pathname]);

  const filterQueryString = useMemo(() => {
    const params = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const v = filters[key];
      if (v) params.set(key, v);
    }
    return params.toString();
  }, [filters]);

  const hasFilters = FILTER_KEYS.some((k) => filters[k]);

  return { filters, setFilter, clearFilters, filterQueryString, hasFilters };
}

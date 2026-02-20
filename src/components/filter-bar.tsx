"use client";

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { useGlobalFilters, FILTER_KEYS } from "@/lib/use-global-filters";
import type { DimensionValues } from "@/lib/types";

const DIMENSION_LABELS: Record<string, string> = {
  project: "Project",
  environment: "Environment",
  team: "Team",
  developer: "Developer",
};

const DIMENSION_ARRAY_KEYS: Record<string, keyof DimensionValues> = {
  project: "projects",
  environment: "environments",
  team: "teams",
  developer: "developers",
};

export function FilterBar() {
  const { filters, setFilter, clearFilters, filterQueryString, hasFilters } =
    useGlobalFilters();
  const [dimensions, setDimensions] = useState<DimensionValues | null>(null);

  const fetchDimensions = useCallback(() => {
    fetch(`/api/dimensions${filterQueryString ? `?${filterQueryString}` : ""}`)
      .then((r) => r.json())
      .then((data) => setDimensions(data))
      .catch(() => {});
  }, [filterQueryString]);

  useEffect(() => {
    fetchDimensions();
  }, [fetchDimensions]);

  return (
    <div className="border-b bg-background">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
        {FILTER_KEYS.map((key) => (
          <select
            key={key}
            value={filters[key] ?? ""}
            onChange={(e) => setFilter(key, e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">All {DIMENSION_LABELS[key]}s</option>
            {(dimensions?.[DIMENSION_ARRAY_KEYS[key]] ?? []).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        ))}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}

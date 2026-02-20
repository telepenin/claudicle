"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { FILTER_KEYS } from "@/lib/use-global-filters";

export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);

  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const v = searchParams.get(key);
    if (v) params.set(key, v);
  }
  const qs = params.toString();
  const fullHref = `${href}${qs ? `?${qs}` : ""}`;

  return (
    <Link
      href={fullHref}
      className={cn(
        "text-sm font-medium transition-colors hover:text-foreground",
        isActive ? "text-foreground" : "text-muted-foreground"
      )}
    >
      {children}
    </Link>
  );
}

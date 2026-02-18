import { NavLink } from "@/components/nav-link";
import { Activity } from "lucide-react";

export function Header() {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <div className="flex items-center gap-2 font-semibold">
          <Activity className="h-5 w-5" />
          <span>Claude Logs</span>
        </div>
        <nav className="flex items-center gap-4">
          <NavLink href="/">Dashboard</NavLink>
          <NavLink href="/logs">Logs</NavLink>
        </nav>
      </div>
    </header>
  );
}

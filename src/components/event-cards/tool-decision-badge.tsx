import { Badge } from "@/components/ui/badge";
import { Shield } from "lucide-react";
import type { OtelEvent } from "@/lib/types";

export function ToolDecisionBadge({ event }: { event: OtelEvent }) {
  const tool = event.attributes["tool_name"] || "unknown";
  const decision = event.attributes["decision"] || "unknown";
  const source = event.attributes["source"];
  const accepted = decision === "accept" || decision === "allowed";

  return (
    <div className="flex items-center gap-2 py-1">
      <Shield className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-sm">
        <span className="font-mono text-xs">{tool}</span>
        {" — "}
        <Badge
          variant={accepted ? "secondary" : "destructive"}
          className="text-xs"
        >
          {decision}
        </Badge>
        {source && (
          <span className="ml-1 text-xs text-muted-foreground">
            ({source})
          </span>
        )}
      </span>
    </div>
  );
}

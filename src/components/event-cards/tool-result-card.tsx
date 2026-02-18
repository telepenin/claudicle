import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wrench } from "lucide-react";
import { formatDuration } from "@/lib/format";
import type { OtelEvent } from "@/lib/types";

export function ToolResultCard({ event }: { event: OtelEvent }) {
  const toolName = event.attributes["tool_name"] || "unknown";
  const success = event.attributes["success"] !== "false";
  const durationMs = Number(event.attributes["duration_ms"] || 0);

  return (
    <Card
      className={`border-l-4 ${success ? "border-l-green-500" : "border-l-red-500"}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono">{toolName}</span>
          </div>
          <div className="flex items-center gap-2">
            {durationMs > 0 && (
              <span className="text-xs text-muted-foreground">
                {formatDuration(durationMs)}
              </span>
            )}
            <Badge variant={success ? "secondary" : "destructive"}>
              {success ? "success" : "failed"}
            </Badge>
          </div>
        </div>
        {event.message && (
          <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
            {event.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

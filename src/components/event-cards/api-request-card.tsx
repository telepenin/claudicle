import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cpu } from "lucide-react";
import { formatCost, formatTokens, formatDuration } from "@/lib/format";
import type { OtelEvent } from "@/lib/types";

export function ApiRequestCard({ event }: { event: OtelEvent }) {
  const model = event.attributes["model"] || "unknown";
  const inputTokens = Number(event.attributes["input_tokens"] || 0);
  const outputTokens = Number(event.attributes["output_tokens"] || 0);
  const cost = Number(event.attributes["cost_usd"] || 0);
  const durationMs = Number(event.attributes["duration_ms"] || 0);

  return (
    <Card className="border-l-4 border-l-gray-400">
      <CardContent className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            API Request
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            {model}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {inputTokens > 0 && (
            <span>
              In: <span className="font-medium">{formatTokens(inputTokens)}</span>
            </span>
          )}
          {outputTokens > 0 && (
            <span>
              Out: <span className="font-medium">{formatTokens(outputTokens)}</span>
            </span>
          )}
          {cost > 0 && (
            <span>
              Cost: <span className="font-medium">{formatCost(cost)}</span>
            </span>
          )}
          {durationMs > 0 && (
            <span>{formatDuration(durationMs)}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

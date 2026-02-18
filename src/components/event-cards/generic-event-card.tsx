import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Circle } from "lucide-react";
import type { OtelEvent } from "@/lib/types";

export function GenericEventCard({ event }: { event: OtelEvent }) {
  const attrs = Object.entries(event.attributes).filter(
    ([, v]) => v !== ""
  );

  return (
    <Card className="border-l-4 border-l-gray-300">
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Circle className="h-4 w-4 text-muted-foreground" />
          <Badge variant="outline" className="font-mono text-xs">
            {event.event_name}
          </Badge>
        </div>
        {event.message && (
          <p className="mb-2 text-sm">{event.message}</p>
        )}
        {attrs.length > 0 && (
          <div className="space-y-1">
            {attrs.slice(0, 5).map(([k, v]) => (
              <div key={k} className="flex gap-2 text-xs">
                <span className="font-mono text-muted-foreground">{k}:</span>
                <span className="truncate">{v}</span>
              </div>
            ))}
            {attrs.length > 5 && (
              <p className="text-xs text-muted-foreground">
                +{attrs.length - 5} more attributes
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

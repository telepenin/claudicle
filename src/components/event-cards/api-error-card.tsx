import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import type { OtelEvent } from "@/lib/types";

export function ApiErrorCard({ event }: { event: OtelEvent }) {
  const errorMessage =
    event.attributes["error_message"] || event.message || "Unknown error";
  const statusCode = event.attributes["status_code"];

  return (
    <Card className="border-l-4 border-l-red-600">
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-red-700">
          <AlertCircle className="h-4 w-4" />
          API Error
          {statusCode && (
            <span className="font-mono text-xs text-red-500">
              ({statusCode})
            </span>
          )}
        </div>
        <p className="text-sm text-red-600">{errorMessage}</p>
      </CardContent>
    </Card>
  );
}

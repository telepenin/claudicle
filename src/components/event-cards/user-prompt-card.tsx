import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";
import type { OtelEvent } from "@/lib/types";

export function UserPromptCard({ event }: { event: OtelEvent }) {
  const prompt = event.attributes["prompt"] || event.message;
  const promptLength = event.attributes["prompt_length"];

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-700">
          <MessageSquare className="h-4 w-4" />
          User Prompt
        </div>
        {prompt ? (
          <p className="whitespace-pre-wrap text-sm">{prompt}</p>
        ) : promptLength ? (
          <p className="text-sm text-muted-foreground">
            Prompt ({promptLength} characters)
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Empty prompt</p>
        )}
      </CardContent>
    </Card>
  );
}

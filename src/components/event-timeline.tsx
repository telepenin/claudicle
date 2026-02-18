import type { OtelEvent } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";
import { UserPromptCard } from "@/components/event-cards/user-prompt-card";
import { ToolResultCard } from "@/components/event-cards/tool-result-card";
import { ApiRequestCard } from "@/components/event-cards/api-request-card";
import { ApiErrorCard } from "@/components/event-cards/api-error-card";
import { ToolDecisionBadge } from "@/components/event-cards/tool-decision-badge";
import { GenericEventCard } from "@/components/event-cards/generic-event-card";

function EventCard({ event }: { event: OtelEvent }) {
  switch (event.event_name) {
    case "user_prompt":
      return <UserPromptCard event={event} />;
    case "tool_result":
      return <ToolResultCard event={event} />;
    case "api_request":
      return <ApiRequestCard event={event} />;
    case "api_error":
      return <ApiErrorCard event={event} />;
    case "tool_decision":
      return <ToolDecisionBadge event={event} />;
    default:
      return <GenericEventCard event={event} />;
  }
}

export function EventTimeline({ events }: { events: OtelEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        No events found for this session.
      </p>
    );
  }

  return (
    <div className="relative space-y-4 pl-6">
      <div className="absolute top-0 bottom-0 left-2 w-px bg-border" />
      {events.map((event, i) => (
        <div key={`${event.timestamp}-${i}`} className="relative">
          <div className="absolute -left-4 top-4 h-2 w-2 rounded-full bg-border" />
          <div className="mb-1 text-xs text-muted-foreground">
            {formatRelativeTime(event.timestamp)}
            <span className="ml-2 font-mono">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
          </div>
          <EventCard event={event} />
        </div>
      ))}
    </div>
  );
}

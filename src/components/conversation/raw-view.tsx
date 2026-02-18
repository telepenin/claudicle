"use client";

import type { LogMessage } from "@/lib/types";

export function RawJsonlView({ messages }: { messages: LogMessage[] }) {
  return (
    <div className="divide-y divide-border">
      {messages.map((msg, i) => {
        let formatted = msg.raw;
        try {
          formatted = JSON.stringify(JSON.parse(msg.raw), null, 2);
        } catch {
          // keep raw
        }
        return (
          <div key={`${msg.msg_timestamp}-${i}`} className="py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-0.5">
              <span className="font-mono">{msg.msg_type}</span>
              <span>
                {new Date(msg.msg_timestamp).toLocaleTimeString()}
              </span>
            </div>
            <pre className="overflow-auto rounded-md bg-background p-3 text-xs whitespace-pre-wrap">
              {formatted}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function normalizeMarkdown(text: string): string {
  return text.replace(/\*\*`([^`]+)`\*\*/g, "`$1`");
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-pre:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => (
            <pre className="overflow-auto rounded-md bg-muted p-3 text-xs text-foreground">
              {children}
            </pre>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <code className={`${className} before:content-none after:content-none`}>
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono before:content-none after:content-none">
                {children}
              </code>
            );
          },
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline hover:text-blue-800"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">{children}</table>
            </div>
          ),
        }}
      >
        {normalizeMarkdown(text)}
      </ReactMarkdown>
    </div>
  );
}

export function CollapsibleContent({
  text,
  maxLines = 20,
  defaultOpen = false,
}: {
  text: string;
  maxLines?: number;
  defaultOpen?: boolean;
}) {
  const lines = text.split("\n");
  const totalLines = lines.length;
  const needsCollapse = totalLines > maxLines;
  const [expanded, setExpanded] = useState(defaultOpen || !needsCollapse);

  if (!needsCollapse) {
    return (
      <pre className="overflow-auto rounded-md bg-background p-3 text-xs whitespace-pre-wrap">
        {text}
      </pre>
    );
  }

  return (
    <div>
      <pre className="overflow-auto rounded-md bg-background p-3 text-xs whitespace-pre-wrap">
        {expanded ? text : lines.slice(0, maxLines).join("\n") + "\n…"}
      </pre>
      <button
        className="mt-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded
          ? "Show less"
          : `Show all ${totalLines} lines`}
      </button>
    </div>
  );
}

export function CollapsibleMarkdown({
  text,
  maxLines = 10,
  defaultOpen = false,
}: {
  text: string;
  maxLines?: number;
  defaultOpen?: boolean;
}) {
  const totalLines = text.split("\n").length;
  const needsCollapse = totalLines > maxLines;
  const [expanded, setExpanded] = useState(defaultOpen || !needsCollapse);

  return (
    <div>
      {expanded ? (
        <Markdown text={text} />
      ) : (
        <Markdown text={text.split("\n").slice(0, maxLines).join("\n") + "\n…"} />
      )}
      {needsCollapse && (
        <button
          className="mt-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : `Show all (${totalLines} lines)`}
        </button>
      )}
    </div>
  );
}

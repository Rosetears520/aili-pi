"use client";

import { Fragment, useMemo } from "react";
import { parseAnsiLine } from "@/lib/ansi";

/**
 * Shared renderer for ANSI SGR output emitted by extensions and tools. React
 * owns every text node, so untrusted output is escaped rather than interpreted
 * as markup.
 */
export function AnsiText({ text }: { text: string }) {
  const segments = useMemo(() => parseAnsiLine(text), [text]);
  return (
    <span>
      {segments.map((segment, index) => (
        Object.keys(segment.style).length > 0
          ? <span key={index} style={segment.style}>{segment.text}</span>
          : <Fragment key={index}>{segment.text}</Fragment>
      ))}
    </span>
  );
}

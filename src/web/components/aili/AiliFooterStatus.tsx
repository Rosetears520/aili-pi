"use client";

import type { ExtensionWidgetItem } from "@/lib/types";
import { ExtensionWidgets } from "../ExtensionWidgets";

/**
 * Bottom shelf under the composer. Statuses were removed here by user call
 * (2026-08-22): the TUI-aligned text line duplicated the top bar and added
 * noise; extension widgets remain hosted so interactive extension UI keeps
 * working.
 */
export function AiliFooterStatus({
  widgets = [],
}: {
  widgets?: ExtensionWidgetItem[];
}) {
  if (widgets.length === 0) return null;
  return (
    <div className="extension-status-shelf has-widgets">
      <ExtensionWidgets widgets={widgets} />
    </div>
  );
}

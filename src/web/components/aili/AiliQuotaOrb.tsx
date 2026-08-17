"use client";

import { useEffect, useRef, useState } from "react";
import type { QuotaStatusView } from "@/lib/aili-status";

export function AiliQuotaOrb({ quota }: { quota: QuotaStatusView | undefined }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const percent = quota?.percent;
  const unknown = percent === undefined;
  const tone = unknown ? "var(--text-dim)" : percent > 50 ? "var(--text-muted)" : percent > 15 ? "rgba(234,179,8,0.95)" : "#ef4444";
  const ring = unknown ? "var(--border)" : `conic-gradient(${tone} ${percent * 3.6}deg, var(--border) 0deg)`;

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        className="aili-quota-orb"
        onClick={() => setOpen((value) => !value)}
        title={quota ? quota.lines.join(" · ") : "Quota: no data yet"}
        aria-label="Provider quota"
        aria-expanded={open}
      >
        <span className="aili-quota-ring" style={{ background: ring }} />
        <span className="aili-quota-core">{unknown ? "?" : `${Math.round(percent)}%`}</span>
      </button>
      {open && (
        <div className="aili-menu aili-quota-popover" role="dialog" aria-label="Provider quota">
          {quota ? quota.lines.map((line, index) => (
            <p key={index} className="aili-quota-line">{line}</p>
          )) : <p className="aili-quota-line">No quota data reported yet.</p>}
        </div>
      )}
    </div>
  );
}

"use client";

const MAX_RENDERED_ROWS = 3_000;

export type DiffView = "unified" | "split";

interface UnifiedRow { old: number | null; cur: number | null; sign: "" | "+" | "-"; text: string }
interface SplitRow { old: { ln: number; text: string } | null; neu: { ln: number; text: string } | null; kind: "ctx" | "pair" | "del" | "add" }

/** aicss file-diff styled rows: dual gutters, +/- signs, per-file counts, capped rendering. */
export function AiliFileDiff({ file, patch, view = "unified" }: { file: string; patch: string; view?: DiffView }) {
  const unified: UnifiedRow[] = [];
  const split: SplitRow[] = [];
  let oldLine = 0;
  let curLine = 0;
  let additions = 0;
  let deletions = 0;
  let truncated = false;
  let pendingDels: { ln: number; text: string }[] = [];
  let pendingAdds: { ln: number; text: string }[] = [];

  const flushSplitBlock = () => {
    const paired = Math.min(pendingDels.length, pendingAdds.length);
    for (let index = 0; index < pendingDels.length || index < pendingAdds.length; index += 1) {
      const old = pendingDels[index] ?? null;
      const neu = pendingAdds[index] ?? null;
      split.push({ old, neu, kind: old && neu ? "pair" : old ? "del" : "add" });
    }
    void paired;
    pendingDels = [];
    pendingAdds = [];
  };

  for (const line of patch.split("\n")) {
    if (line.startsWith("@@")) {
      flushSplitBlock();
      const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (match) { oldLine = Number(match[1]) - 1; curLine = Number(match[2]) - 1; }
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ")) continue;
    if (line.startsWith("+")) {
      curLine += 1; additions += 1;
      unified.push({ old: null, cur: curLine, sign: "+", text: line.slice(1) });
      pendingAdds.push({ ln: curLine, text: line.slice(1) });
    } else if (line.startsWith("-")) {
      oldLine += 1; deletions += 1;
      unified.push({ old: oldLine, cur: null, sign: "-", text: line.slice(1) });
      pendingDels.push({ ln: oldLine, text: line.slice(1) });
    } else {
      flushSplitBlock();
      oldLine += 1; curLine += 1;
      const text = line.startsWith(" ") ? line.slice(1) : line;
      unified.push({ old: oldLine, cur: curLine, sign: "", text });
      split.push({ old: { ln: oldLine, text }, neu: { ln: curLine, text }, kind: "ctx" });
    }
    if (unified.length >= MAX_RENDERED_ROWS || split.length >= MAX_RENDERED_ROWS) { truncated = true; break; }
  }
  flushSplitBlock();

  return (
    <div className="aili-diff">
      <header className="aili-diff-head">
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"
            fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="aili-diff-file">{file}</span>
        <span className="aili-diff-stats"><span className="stat-add">+{additions}</span><span className="stat-del">-{deletions}</span></span>
      </header>
      {view === "unified" ? (
        <div className="aili-diff-body">
          {unified.map((row, index) => (
            <div key={index} className={`aili-diff-row aili-${row.sign === "+" ? "add" : row.sign === "-" ? "del" : "ctx"}`}>
              <span className="aili-diff-ln">{row.old ?? ""}</span>
              <span className="aili-diff-ln">{row.cur ?? ""}</span>
              <span className="aili-diff-sign">{row.sign || " "}</span>
              <code>{row.text}</code>
            </div>
          ))}
        </div>
      ) : (
        <div className="aili-diff-body aili-split">
          {split.map((row, index) => (
            <div key={index} className="aili-split-row" data-kind={row.kind}>
              <div className={`aili-split-cell ${row.old && (row.kind === "pair" || row.kind === "del") ? "aili-split-del" : ""}`}>
                <span className="aili-diff-ln">{row.old?.ln ?? ""}</span>
                <code>{row.old?.text ?? ""}</code>
              </div>
              <div className={`aili-split-cell ${row.neu && (row.kind === "pair" || row.kind === "add") ? "aili-split-add" : ""}`}>
                <span className="aili-diff-ln">{row.neu?.ln ?? ""}</span>
                <code>{row.neu?.text ?? ""}</code>
              </div>
            </div>
          ))}
        </div>
      )}
      {truncated && (
        <div className="aili-diff-truncated">
          Rendering capped at {MAX_RENDERED_ROWS.toLocaleString()} rows — counts above cover the full file; open it locally for the rest.
        </div>
      )}
    </div>
  );
}

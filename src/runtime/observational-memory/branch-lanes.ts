import { hashParts } from "./contracts.js";

export interface PiAncestryEntry {
  id: string;
  parentId?: string | null;
}

/**
 * Assigns one stable, session-local lane to an observed Pi-entry ancestry path.
 * The first child continues its parent's lane; a different child starts a fork
 * lane which its descendants inherit. Leaf IDs are therefore never the lane.
 */
export class PiEntryAncestryLaneTracker {
  private readonly laneByEntry = new Map<string, string>();
  private readonly firstChildByParent = new Map<string, string>();

  constructor(private readonly maximumEntries = 4_096) {
    if (!Number.isSafeInteger(maximumEntries) || maximumEntries < 32) throw new Error("branch lane bound is invalid");
  }

  laneFor(entries: readonly PiAncestryEntry[], sessionId: string): string {
    const path = entries.filter((entry) => typeof entry.id === "string" && entry.id.length > 0).slice(-this.maximumEntries);
    if (!sessionId.trim()) throw new Error("branch lane requires a session id");
    if (path.length === 0) return `lane-${hashParts(sessionId, "root").slice(0, 24)}`;
    if (this.laneByEntry.size + path.length > this.maximumEntries) this.retainActivePath(path, sessionId);

    let previous: PiAncestryEntry | undefined;
    for (const entry of path) {
      const key = entryKey(sessionId, entry.id);
      if (this.laneByEntry.has(key)) { previous = entry; continue; }
      const parentId = typeof entry.parentId === "string" && entry.parentId ? entry.parentId : previous?.id;
      if (!parentId) {
        this.laneByEntry.set(key, `lane-${hashParts(sessionId, entry.id).slice(0, 24)}`);
        previous = entry;
        continue;
      }
      const parentKey = entryKey(sessionId, parentId);
      const parentLane = this.laneByEntry.get(parentKey) ?? `lane-${hashParts(sessionId, parentId).slice(0, 24)}`;
      const childKey = entryKey(sessionId, parentId);
      const firstChild = this.firstChildByParent.get(childKey);
      if (!firstChild) this.firstChildByParent.set(childKey, entry.id);
      const lane = !firstChild || firstChild === entry.id
        ? parentLane
        : `lane-${hashParts(sessionId, parentId, entry.id).slice(0, 24)}`;
      this.laneByEntry.set(key, lane);
      previous = entry;
    }
    return this.laneByEntry.get(entryKey(sessionId, path.at(-1)!.id))!;
  }

  clear(): void { this.laneByEntry.clear(); this.firstChildByParent.clear(); }

  private retainActivePath(path: readonly PiAncestryEntry[], sessionId: string): void {
    const retained = new Map<string, string>();
    for (const entry of path.slice(-this.maximumEntries)) {
      const key = entryKey(sessionId, entry.id);
      const lane = this.laneByEntry.get(key);
      if (lane) retained.set(key, lane);
    }
    this.laneByEntry.clear();
    this.firstChildByParent.clear();
    for (const [key, lane] of retained) this.laneByEntry.set(key, lane);
  }
}

function entryKey(sessionId: string, entryId: string): string { return `${sessionId}\0${entryId}`; }

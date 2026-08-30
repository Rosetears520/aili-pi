/**
 * GitHub-style change tree for the changes page: turns the flat list of
 * repo-relative changed paths into nested directory/file nodes. Pure —
 * the component owns expansion state and rendering.
 */

export interface ChangeRowInput {
  /** Stable row key (absolute path or repo-relative, whatever the page uses) */
  readonly key: string;
  /** Repo-relative path with "/" separators */
  readonly relative: string;
  /** numstat additions, -1 for binary/unmeasured */
  readonly additions?: number;
  /** numstat deletions, -1 for binary/unmeasured */
  readonly deletions?: number;
}

export interface ChangeTreeFile {
  readonly kind: "file";
  readonly key: string;
  readonly name: string;
  readonly additions: number;
  readonly deletions: number;
}

export interface ChangeTreeDir {
  readonly kind: "dir";
  /** Relative directory path ("src/web") — the expansion-state key */
  readonly path: string;
  readonly name: string;
  readonly additions: number;
  readonly deletions: number;
  /** Changed files anywhere below this directory */
  readonly fileCount: number;
  readonly children: readonly ChangeTreeNode[];
}

export type ChangeTreeNode = ChangeTreeFile | ChangeTreeDir;

function measurable(value: number | undefined): number {
  return typeof value === "number" && value > 0 ? value : 0;
}

interface MutableDir {
  readonly path: string;
  readonly name: string;
  additions: number;
  deletions: number;
  fileCount: number;
  readonly dirs: Map<string, MutableDir>;
  readonly files: ChangeTreeFile[];
}

function emptyDir(path: string, name: string): MutableDir {
  return { path, name, additions: 0, deletions: 0, fileCount: 0, dirs: new Map(), files: [] };
}

/**
 * Build the nested tree. Directories sort before files, both alphabetically
 * (case-insensitive). Directory add/remove counts are the sum of the
 * measurable per-file counts beneath them; binary (-1) contributes 0.
 */
export function buildChangeTree(rows: readonly ChangeRowInput[]): readonly ChangeTreeNode[] {
  const root = emptyDir("", "");
  for (const row of rows) {
    const segments = row.relative.split("/").filter((segment) => segment.length > 0);
    if (segments.length === 0) continue;

    // Place the file, creating ancestor dirs on the way down.
    let leaf = root;
    for (let depth = 0; depth < segments.length - 1; depth += 1) {
      const segment = segments[depth];
      let child = leaf.dirs.get(segment);
      if (!child) {
        child = emptyDir(segments.slice(0, depth + 1).join("/"), segment);
        leaf.dirs.set(segment, child);
      }
      leaf = child;
    }
    leaf.files.push({
      kind: "file",
      key: row.key,
      name: segments[segments.length - 1],
      additions: typeof row.additions === "number" ? row.additions : -1,
      deletions: typeof row.deletions === "number" ? row.deletions : -1,
    });

    // Aggregate measurable counts onto the leaf dir and every ancestor.
    const additions = measurable(row.additions);
    const deletions = measurable(row.deletions);
    let walker: MutableDir = root;
    for (let depth = 0; depth < segments.length - 1; depth += 1) {
      walker.additions += additions;
      walker.deletions += deletions;
      walker.fileCount += 1;
      walker = walker.dirs.get(segments[depth])!;
    }
    walker.additions += additions;
    walker.deletions += deletions;
    walker.fileCount += 1;
  }
  return freezeChildren(root);
}

function freezeChildren(dir: MutableDir): readonly ChangeTreeNode[] {
  const nodes: ChangeTreeNode[] = [...dir.dirs.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((child) => ({
      kind: "dir" as const,
      path: child.path,
      name: child.name,
      additions: child.additions,
      deletions: child.deletions,
      fileCount: child.fileCount,
      children: freezeChildren(child),
    }));
  nodes.push(...[...dir.files].sort((left, right) => left.name.localeCompare(right.name)));
  return nodes;
}

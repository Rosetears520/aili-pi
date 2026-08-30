import assert from "node:assert/strict";
import test from "node:test";

async function loadSubject() {
  const { createJiti } = await import("jiti");
  return createJiti(import.meta.url).import("./file-tree.ts");
}

test("flat paths stay top-level files", async () => {
  const { buildChangeTree } = await loadSubject();
  const nodes = buildChangeTree([
    { key: "/r/README.md", relative: "README.md", additions: 3, deletions: 1 },
    { key: "/r/package.json", relative: "package.json", additions: 0, deletions: 2 },
  ]);
  assert.equal(nodes.length, 2);
  assert.ok(nodes.every((node) => node.kind === "file"));
  // Files sort alphabetically regardless of input order.
  assert.deepEqual(nodes.map((node) => node.name), ["package.json", "README.md"]);
});

test("nested paths nest with directories first and alphabetical order", async () => {
  const { buildChangeTree } = await loadSubject();
  const nodes = buildChangeTree([
    { key: "/r/zz.txt", relative: "zz.txt", additions: 1, deletions: 0 },
    { key: "/r/src/b.ts", relative: "src/b.ts", additions: 5, deletions: 0 },
    { key: "/r/src/a.ts", relative: "src/a.ts", additions: 2, deletions: 4 },
    { key: "/r/docs/guide/c.md", relative: "docs/guide/c.md", additions: 0, deletions: 7 },
  ]);
  assert.deepEqual(nodes.map((node) => (node.kind === "dir" ? `d:${node.path}` : `f:${node.name}`)), [
    "d:docs",
    "d:src",
    "f:zz.txt",
  ]);
  const src = nodes.find((node) => node.kind === "dir" && node.path === "src");
  assert.deepEqual(src.children.map((node) => node.name), ["a.ts", "b.ts"]);
  const docs = nodes.find((node) => node.kind === "dir" && node.path === "docs");
  const guide = docs.children[0];
  assert.equal(guide.kind, "dir");
  assert.equal(guide.path, "docs/guide");
  assert.deepEqual(guide.children.map((node) => node.name), ["c.md"]);
});

test("directory counts aggregate measurable per-file numstat and file totals", async () => {
  const { buildChangeTree } = await loadSubject();
  const nodes = buildChangeTree([
    { key: "/r/src/a.ts", relative: "src/a.ts", additions: 5, deletions: 2 },
    { key: "/r/src/deep/b.ts", relative: "src/deep/b.ts", additions: 1, deletions: 0 },
    // Binary rows report -1 and must not inflate the aggregates.
    { key: "/r/src/logo.png", relative: "src/logo.png", additions: -1, deletions: -1 },
    { key: "/r/top.md", relative: "top.md" },
  ]);
  const src = nodes.find((node) => node.kind === "dir" && node.path === "src");
  assert.equal(src.additions, 6);
  assert.equal(src.deletions, 2);
  assert.equal(src.fileCount, 3);
  const deep = src.children.find((node) => node.kind === "dir");
  assert.equal(deep.fileCount, 1);
  const top = nodes.find((node) => node.kind === "file" && node.name === "top.md");
  assert.equal(top.additions, -1);
  assert.equal(top.deletions, -1);
});

test("duplicate directory paths collapse and rows with empty relative are skipped", async () => {
  const { buildChangeTree } = await loadSubject();
  const nodes = buildChangeTree([
    { key: "1", relative: "src/one.ts", additions: 1, deletions: 0 },
    { key: "2", relative: "src/two.ts", additions: 1, deletions: 0 },
    { key: "3", relative: "", additions: 9, deletions: 9 },
  ]);
  const src = nodes.find((node) => node.kind === "dir" && node.path === "src");
  assert.equal(src.fileCount, 2);
  assert.equal(src.additions, 2);
});

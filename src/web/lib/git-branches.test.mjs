import assert from "node:assert/strict";
import test from "node:test";

async function loadSubject() {
  const { createJiti } = await import("jiti");
  return createJiti(import.meta.url).import("./git-branches.ts");
}

test("branch listing parsing sorts, dedupes, and drops blanks", async () => {
  const { parseBranchListing } = await loadSubject();
  assert.deepEqual(
    parseBranchListing("feature/zeta\nmain\n\nfeature/alpha\nmain\n  \nfeature/alpha"),
    ["feature/alpha", "feature/zeta", "main"],
  );
});

test("current branch parsing maps detached HEAD and blank output to null", async () => {
  const { parseCurrentBranch } = await loadSubject();
  assert.equal(parseCurrentBranch("main\n"), "main");
  assert.equal(parseCurrentBranch("feature/foo"), "feature/foo");
  assert.equal(parseCurrentBranch("HEAD"), null);
  assert.equal(parseCurrentBranch("  \n"), null);
});

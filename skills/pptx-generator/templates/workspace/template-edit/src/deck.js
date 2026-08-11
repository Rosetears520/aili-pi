"use strict";

const fs = require("node:fs");
const path = require("node:path");

function readJson(workspaceRoot, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8"));
}

function loadWorkspaceInputs(workspaceRoot = path.resolve(__dirname, "..")) {
  return {
    outline: readJson(workspaceRoot, "outline.json"),
    design: readJson(workspaceRoot, "design-contract.json"),
    fonts: readJson(workspaceRoot, "font-contract.json"),
    fontEnvironment: readJson(workspaceRoot, "font-environment.json"),
    templateProfile: readJson(workspaceRoot, "template-profile.json"),
    sources: readJson(workspaceRoot, "sources/manifest.json"),
    assets: readJson(workspaceRoot, "assets/manifest.json"),
  };
}

function withShapeToFitText(options = {}) {
  return { ...options, fit: "resize" };
}

module.exports = { loadWorkspaceInputs, withShapeToFitText };

if (require.main === module) {
  process.stderr.write("Renderer stub: Package 3 build adapter must preserve the controlling PPTX and supply output.\n");
  process.exitCode = 2;
}

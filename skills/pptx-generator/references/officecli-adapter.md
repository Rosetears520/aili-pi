# OfficeCLI Adapter Boundary

[KNOWN|USER] `pptx-generator` remains the only presentation workflow owner; OfficeCLI is a non-routable external tool adapter whose managed installation is owned by the AILI installer. Source: accepted changes `pptx-workspace-officecli-integration` and `share-officecli-across-office-skills`.

[KNOWN|EXTERNAL] The tested package is exactly `@officecli/officecli@1.0.143`, with Apache-2.0 release/license metadata recorded by the installer-owned `manifests/officecli-tool.json`. Source: OfficeCLI tag `v1.0.143` and the accepted `share-officecli-across-office-skills` contract.

Do not call, install, register, load, or route to an upstream OfficeCLI Skill, including `officecli-pptx`. Do not use `officecli load_skill pptx`, `officecli skills install`, or OfficeCLI MCP as a substitute workflow.

## Stable role and decision table

| Situation | Stable OfficeCLI role | Mutation/evidence rule |
|---|---|---|
| Inspect an existing PPTX | Read-only outline, text, stats, issues, query/dump, validate, and render inspection | Default to read-only operations; findings are evidence, not a completion verdict. |
| Template-preserving edit | Structural inspection plus narrow deterministic DOM/batch edits | Preserve the original PPTX unchanged; store the edit plan/batch as replayable authoring source. |
| From-scratch deck | Validate, inspect issues/content, and render the primary renderer's PPTX | Do not make ordinary content/layout changes directly in the derived PPTX. |
| Rebuildable postbuild feature | Apply `patches/officecli-postbuild.batch.json` after every base build | The batch is source, order-preserving, and replayed from the current base before save and validate. |
| Standalone PPTX with no rebuildable source | One bounded patch to a working copy | Preserve the original, record the patch, and label the source/rebuildability limitation. |
| Raw XML fallback | Last resort only when supported DOM/batch operations cannot express the accepted change | Record exact part, selector/XPath, action, and re-run validation; never make raw XML the default edit path. |

## Syntax authority

[FRAME] The adapter has a version-scoped command table for the pinned binary and queries each family with `<command> --help`; it does not assume a `pptx` namespace. The installed help must agree with the table before mutation or evidence capture. If help or the required capability is unavailable, stop rather than guessing or adding a compatibility wrapper.

[FRAME] Probes and all workspace commands set `OFFICECLI_SKIP_UPDATE=1`. Probes may run only `--version` and help/capability queries. Version drift from `1.0.143` requires command-capability revalidation; it never triggers an implicit update or downgrade.

[FRAME] This Skill has no OfficeCLI setup or npm execution path. If the managed binary is absent or drifted, stop and direct recovery to `rose-aili install` or `rose-aili update` without `--skip-officecli`; if OfficeCLI was intentionally skipped, keep the PPTX operation blocked until the installer-managed tool is restored. Do not use a full OfficeCLI installer, a bare auto-install, Skill/MCP setup, or PATH/shell integration. PPT probe/build/render continue to refuse a drifted version rather than guessing pinned syntax.

## Visual evidence boundary

[FRAME] `validate`, issues, outline, text, contact sheets, and per-slide PNGs are separate evidence inputs. `watch` is only a collaborative live preview and selection aid; it is not visual-review proof and is never a completion gate.

[FRAME] The issue report records executable/version, exact argv, current final-PPTX hash, issue count and entries; the render manifest binds its report hash. Every issue is blocking unless layout preflight records a slide/shape-specific non-blocking disposition with a reason and current render observation. Overflow, hidden text, unresolved placeholders, distortion, severe overlap, font substitution, and unknown issues cannot be waived.

[FRAME] Screenshots become visual-review evidence only after the current host actually opens and inspects the bound images for clipping, overlap, hierarchy, crop, contrast, typography, substitution, and deck rhythm. File existence, hashes, help output, or a successful render command cannot mark visual review passed.

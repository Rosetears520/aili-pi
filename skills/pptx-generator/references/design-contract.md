# Design Brief, Contract, and Style Proof

[FRAME] `design-brief.json` captures audience need, communication goal, tone, controlling source, and unresolved material choices. `design-contract.json` converts accepted choices into reusable slide-size, content-area, typography-role, palette-role, shape, image, chart/table, and navigation rules.

[FRAME] The contract governs implementation but does not contain slide titles or copy; those remain in the canonical Markdown plan.

## Style Proof

[FRAME] For a from-scratch full deck, render a representative proof from the current outline, design contract, and renderer: cover, typical content page, and the most complex applicable data/process/table/image page.

[FRAME] Review the actual proof renders before locking. `style-lock.json` binds exact design-contract, proof-PPTX, proof-render, review hashes, and slide IDs. Any bound source or artifact change makes the lock stale.

[FRAME] Use `build_workspace.py <workspace> --kind style-proof --mode execute`, render representative stable IDs with repeated `render_with_officecli.py --slide-id <id>` into `renders/style-proof/`, and emit `emit_visual_review_packet.py --review-scope style-proof`. After an image-capable reviewer records a current `pass`, run `lock_style_proof.py`; the default full build then rejects a missing or stale lock.

[FRAME] When one direction satisfies the accepted brief, repair sources and lock it without asking for decorative micro-decisions. When alternatives materially change brand, font, evidence, or deliverable form, return `need-user`.

# CONTEXT-FORMAT.md

Provenance: copied/adapted for AILI requirements-grilling from upstream Matt Pocock `domain-modeling/CONTEXT-FORMAT.md` behavior under the upstream MIT License.

Use this reference when `requirements-grilling` updates the change-local `context.md` Language section.

## Structure

```markdown
# {Context Name}

Short description of what this context describes.

## Language

**Term Name**:
Tight, project-specific definition.
_Avoid_: Ambiguous or rejected alternatives.
```

## Rules

- Be opinionated.
- Keep definitions tight.
- Record project-specific terms only.
- Group terms when natural.
- Include `_Avoid_` alternatives when they prevent future ambiguity.
- Do not store implementation decisions, scratchpad notes, generic programming terms, or architecture rationale in Language.
- Use ADRs, design docs, specs, or tasks for decisions and trade-offs.

## AILI Adaptation

- For OpenSpec changes, `context.md` remains beside `interview.md`.
- Update Language only when project-specific terms or terminology conflicts are discovered and resolved.
- Do not update Language merely because a grilling round ran.

## Single and Multi-Context Notes

- A single change-local context is enough when one OpenSpec change owns the terminology.
- Multiple contexts are useful only when independent domains would make one glossary misleading.
- If multiple contexts exist, keep each term in the context that owns the term's meaning.

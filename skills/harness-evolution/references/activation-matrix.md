# Harness Evolution Activation Matrix

| Signal | Required gate | Optional gate | Approval-gated action |
|---|---|---|---|
| Explicit harness change request | report, component classification | OpenSpec proposal | editing core harness files |
| Repeated workflow failure | report, evidence anchors | strategy stress test | changing lifecycle rules |
| Subagent dispatch error | packet/result evidence review | parallel-dispatch guidance update | changing subagent contracts |
| Verification claim failure | fresh evidence requirement | review/test audit | weakening completion gates |
| Memory failure | rose-memory CLI evidence | memory retrieval pack | schema or policy change |
| Command lifecycle bypass | command map check | command fixture update | adding/removing command files |
| Install/setup drift | setup evidence | install smoke check | modifying install scripts |

Low-risk observation may stop at a report. Any core harness edit needs explicit human approval first.

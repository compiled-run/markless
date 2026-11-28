You are reviewing reference solutions for an API-design study, read-only. Four designs of a hypothetical device package ("@markless/device") each have a signature sheet and eight reference solutions written by the same author. Later, readers will compare the designs by reading these solutions, so no design may be disadvantaged by sloppier or less careful code.

Read ONLY these files (do not modify anything, do not search the repository, do not use the web):
- /Users/jackshelton/wt/markless/device-api-round2/docs/goals/native-targets-api/device-api-ab/round2/tasks.md (the eight tasks; ignore its label table)
- /Users/jackshelton/wt/markless/device-api-round2/docs/goals/native-targets-api/device-api-ab/round2/sheets/WZ.d.ts, JR.d.ts, ZK.d.ts, DU.d.ts
- /Users/jackshelton/wt/markless/device-api-round2/docs/goals/native-targets-api/device-api-ab/round2/solutions/<label>/task1.md … task8.md for WZ, JR, ZK, DU

Markless basics you need: a component body is `@{ statements; one root element }`, runs once (no re-renders); `state()` values update by assignment; `@if`/`@else`/`@for` blocks hold one node each; `shared()` gives every caller one copy of some state; `element()` makes a handle to a real element bound with `el={handle}`.

For each task, compare the four designs' solutions for parity of care:
1. Does each solution do everything the task asks, as far as its sheet's stated guarantees go?
2. Are user-facing touches equal: same messages, same extra handling (for example a refusal message shown in one design but not another, a guard present in one design only, a nicer time format in one only)?
3. Is any solution needlessly longer, more awkward or less idiomatic than its sheet allows, or does any use a capability its sheet does not declare?
4. Anything that would make a reader misjudge a design (a misleading comment, an inconsistency between tasks of the same design)?

Reply with a list of concrete findings, each naming design label, task number, the issue, and a suggested fix. Say plainly if a task has no parity problems. Be strict but do not invent problems: the designs are meant to differ in shape; only flag differences in care, completeness or correctness.
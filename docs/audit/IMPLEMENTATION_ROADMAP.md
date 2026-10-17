# Implementation roadmap

Date: 2026-10-17. Audited source: `fe7f9fa7b2d059f1f34c30bfd887dd638de2ae70`. This document proposes later coding work; nothing below is implemented by the audit PR. The earlier master brief is unavailable, so sequencing is based on observed defects and engineering dependencies. No unsupported delivery dates or effort estimates are implied.

## Recommended first phase: engineering validity and data preservation

The first deliverable should make invalid, incomplete, unsupported, and infeasible line models explicit while preserving the user's prior project. It should prevent both P0 release blockers before adding features or redesigning the interface. Preserve the existing working deterministic single-operator examples as regression oracles.

| Work package | Findings | Concrete change | Acceptance gate |
| --- | --- | --- | --- |
| Shared model/graph boundary | P0-001, DATA-001, DATA-003/004/007 | Runtime schema and cross-reference validation: finite values, units, unique identities, positive integral workforce, assignment membership, existing predecessors, DAG validation with cycle paths | Ordinary edits and every import/load/apply path report invalid inputs without crashes or silent graph changes |
| Explicit engineering result state | P0-002, OPT-004 | Return validity/completeness/feasibility with reasons; distinguish customer-demand comparison from full routing/resource feasibility | Reversed edges, cycles, empty plans, unassigned work, oversize tasks, and unsupported models never appear approved or unqualified “attained” |
| Safe report status | P0-002 | Remove unconditional certification; present draft/invalid/incomplete/feasible status and assumptions. Formal approval, if later required, needs its own recorded review model | Printing an invalid line clearly communicates its defects; printing a feasible line does not imply a human certification |
| Correct quantity contracts | ENG-001/002/004/005 | Separate available seconds and output per day/per period; whole-project work versus allocated work; labor lower bound versus physical station count; ideal versus effective output basis | Golden multi-day/backlog fixtures match independently derived arithmetic; all views use matching units and scope |
| Conservative execution assumptions | ENG-003 | Document and enforce the supported MVP model. A simple first option is single-operator sequential stations; unsupported multi-operator/machine cases remain visible but cannot claim validated physical capacity | Adding labor cannot silently accelerate a fixed machine operation; support expansion requires explicit resource semantics |
| Atomic data transitions and recovery | DATA-001/002/005/006, UI-001 | Parse/validate before replacing state; preserve known-good data; retain unedited fields; surface failed saves; initialize parameter drafts from active project | Failed or canceled actions preserve prior work; unchanged edit preserves qualifications; reload and switching cannot silently discard the only copy |
| Safe engineering interaction | UI-003/004 | Use a common unshrunk chart baseline; isolate dialog focus and background interaction | Rendered bar geometry matches numeric takt comparisons; keyboard actions cannot mutate background tasks while a modal is open |
| Regression coverage | QA-001 | Add focused utility, handler, and browser regressions for those contracts | Existing8 cases plus the new P0/day-period/backlog/import/preservation fixtures execute and pass in CI |

Suggested dependency order: validation/result contract → graph crash and report gate → numerical scope corrections → transactional data transitions → browser/CI acceptance. Split into small reviewable coding PRs when useful; agree contract names before parallel modifications. Do not add a complex solver, backend, or full component rewrite to this phase.

Phase 1 is complete only when an ordinary cyclic edit leaves a usable app; invalid imports cannot replace usable project data; false certification is gone; day/period and whole-project metrics are correct; and unsupported physical assumptions are labeled and excluded from validated capacity claims. A caught exception, a disabled assertion, or a generic warning while retaining green success is insufficient.

## Phase 2: optimizer result integrity

Resolve OPT-001 through OPT-004 after the shared evaluator is available:

1. Store and return a single authoritative assignment map in leveling. Validate every proposed move against the current map, and recompute the final canonical result before returning it.
2. Guarantee station ID/code uniqueness against both retained and generated stations. Preserve task identity, metadata, duration, and graph edges exactly.
3. Select and enforce one operator/resource contract for packing. Remove duplicated KPI arithmetic from optimizer summaries and derive their values from the shared evaluator.
4. Return structured feasible/infeasible/incomplete/unsupported outcomes. Explain oversize tasks and unresolved prerequisites; disable applying a result that violates its required constraints.
5. Verify deterministic tie-breaking, task conservation, precedence, target compliance, no input mutation, and preview/apply equivalence. Benchmark supported workloads before adding complexity or worker offloading.

Acceptance: the leveling70s fixture returns the moved allocation and metrics describing that allocation; the generated `station-2` collision fixture has unique IDs and conserved total work; mixed-operator behavior matches the chosen model; and a120s indivisible task under a60s bound is explicitly infeasible. Algorithm quality claims should remain heuristic unless verified against an exact oracle.

## Phase 3: trustworthy interchange and durable project management

Replace line-based CSV splitting with a maintained RFC4180 parser or an equivalently tested implementation; validate headers, finite numeric fields, codes, enum values, referenced predecessors, and station mappings. Treat unresolved references as diagnostics requiring correction rather than silently removing constraints. Provide an explicit import preview and replacement decision; preserve a pre-import snapshot or recoverable backup. Test quoted commas, quotes, embedded newlines, Unicode, duplicates, and empty records.

Version the JSON project schema and define migrations before changing persisted structure. Make local save state visible and provide recovery/export after quota or corruption failures. Integrate a genuine saved-project catalog or warn and back up before switching/resetting. Preserve task skills/tools and any supported extension fields through editor and export flows. Address spreadsheet formula interpretation with an explicit safe export policy and fidelity tests (SEC-001), rather than assuming RFC quoting makes formulas inert.

Acceptance: documented JSON and CSV round trips conserve supported data; failed input does not replace the active project; storage failures are visible; switching away and back recovers user work; task/station code creation stays unambiguous after deletion.

## Phase 4: explicit industrial engineering model

Agree semantics with a domain engineer before expanding capacity claims. Specify manual work, automatic machine cycles, setup, operator attendance, shared fixtures/tools, parallel identical resources, indivisible operations, task splitting, and allowed overlap. Record whether durations represent measured elapsed time or labor content; define loss and OEE treatment to avoid double-counting.

Choose the simplest schedulability model that supports the product's intended use. Model operator availability and station order rather than dividing every task by headcount. Distinguish labor lower bounds, bottleneck resource throughput, precedence latency, achievable steady-state rate, and good-output planning capacity. A multi-manned station or shared-machine model needs its own feasibility checks and regression oracles. Required skills and ergonomics currently describe tasks; they are not enforced staffing constraints.

Acceptance: representative manual, machine-bound, parallel-resource, and mixed-work examples are reviewed against explicit schedules and independent calculations; outputs expose assumptions. Do not describe the sample projects as certified plant benchmarks without time-study evidence.

## Phase 5: usability, accessibility, and maintainability

Make all primary views reachable at narrow widths; give icon controls accessible names; associate labels and inputs; implement dialog semantics/focus handling; and provide keyboard task allocation. Correct stale drafts across project/scenario changes. Keep chart labels consistent between labor seconds and station elapsed seconds, especially if multiple operators remain supported.

Extract validated domain operations from App, share graph construction/traversal, and consolidate heuristic packing where its semantics are identical. Establish a lockfile and dependency policy in a separate maintenance PR, resolve the Vite/esbuild peer conflict, remove unused runtime dependencies after verification, and wire meaningful type/build/test/browser checks into CI. Profile actual tasks/scenarios before promising scale improvements.

## Release gates and review ownership

| Gate | Evidence required | Suggested accountable reviewer |
| --- | --- | --- |
| Engineering correctness | Independently derived unit/formula/resource fixtures, invalid-state behavior, honest report status | Domain engineer and application engineer |
| Model/data integrity | Runtime schema, DAG/cross-reference tests, safe state transitions, import round trips and recovery | Application engineer |
| Optimizer integrity | Conserved tasks/metadata, unique IDs, valid precedence, canonical metrics, explicit infeasibility | Algorithm engineer or reviewer familiar with the heuristic |
| User workflow | Browser tests for edit/import/reload/switch/scenario/print, keyboard and narrow-screen use | Product/UI reviewer |
| Delivery | Reproducible dependency resolution and CI results on exact reviewed commit | Repository maintainer |

These are proposed review responsibilities, not assertions that a staffed team or approval process already exists. Close findings only with code and executed evidence on the implementation commit. Retain this audit baseline and link remediation PRs back to the stable finding IDs.

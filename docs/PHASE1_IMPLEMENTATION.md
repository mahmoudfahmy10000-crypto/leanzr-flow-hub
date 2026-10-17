# Phase 1: engineering validity and data preservation

This implementation follows the six reports in [audit/](audit/MASTER_CODEBASE_AUDIT.md), whose source baseline is `fe7f9fa7b2d059f1f34c30bfd887dd638de2ae70`. The audit commit `7dcbb70` and its six documents are unchanged. Implementation is on `feat/phase-1-engineering-validity`, based on the audit branch so it can be reviewed separately from the documentation changes. No merge is performed.

## Engineering contract

`validateProject` checks runtime shape, metadata, finite numeric values, bounds, scoped unique IDs/codes, references, schedules, and every scenario. `topologicalTaskOrder` uses iterative graph traversal and reports actionable cyclic groups and paths without recursion. Validation never removes graph edges, coerces numeric strings, repairs malformed objects, or strips extension metadata.

`calculateLineMetrics` is the shared evaluator for the dashboard, scenarios, optimizer proposals, reports, and import review. Every result contains `assessment.status`, `reasons`, and `assumptions`. Status precedence is invalid → incomplete → unsupported → infeasible → valid, with all applicable reasons retained. A valid outcome only means the supported deterministic model meets customer takt; it never records professional approval.

| State | Meaning | Example |
| --- | --- | --- |
| invalid | Input shape, identity, graph, reference, or numeric calculation range is invalid | A↔B dependency, missing station, Infinity, aggregate overflow |
| incomplete | A complete line has not been allocated | Empty line or backlog tasks |
| unsupported | Data is structurally valid, but execution assumptions exceed the supported model | Multiple operators at a station |
| infeasible | The supported complete line violates routing order or customer takt | Prerequisite at a later station, cycle time above takt |
| valid | Complete supported line passes the recorded model checks and takt comparison | A valid single-operator sequential allocation |

The initial execution model is conservative and sequential: a station cycle is the sum of its task elapsed times, with one dedicated operator assumed occupied throughout every task, including machine dwell. Its labor bounds are not a staffing study. Adding operators never shortens a task or fixed machine operation. Multi-operator data remains visible and editable, but is unsupported for validated output. Skills, tools, fixtures, ergonomics, shared machines, overlap, and physical schedules are not enforced. Nominal capacity excludes variability, startup, failures, and quality losses. OEE is explicitly informational rather than silently applied; customer takt remains scheduled period time divided by period demand.

Daily and period time/output are distinct fields. Whole-project work content, category mix, and labor-content lower bound include backlog; allocated work and its VA ratio are separate quantities. The minimum is labeled a labor-content lower bound, not a general physical workstation minimum. Existing `theoreticalMinWorkstations` remains a compatibility alias in the result type; the UI uses `theoreticalMinOperators`.

## Data transitions and recovery

Manual edits, scenario changes, imports, and optimizer application use validated transitions. Invalid inputs or nonfinite derived results leave the current project unchanged. Infeasible, incomplete, and unsupported plans can remain working drafts with explicit status; optimized results cannot be applied or saved as optimized scenarios unless both the selected target and real operating plan pass the evaluator.

CSV parsing handles complete quoted records, embedded line endings, exact headers, full finite numeric values, qualifications/tools, unique codes, and graph/station references. Any error rejects the whole candidate. JSON restores validate complete projects and scenarios. Valid imports first show a replacement review with model status; cancel leaves the workspace intact. A file read or confirmation started for an earlier project cannot overwrite a changed project.

Persistence validates before writing, archives a previous known-good active revision, retains a catalog of projects by ID, and writes the new active key last. Failure rolls back auxiliary writes where possible and leaves the active project unchanged; errors are shown in the workspace and, for form saves, inside the open dialog. The current project can still be exported. Saved custom projects are reachable in the project menu; selecting a benchmark restores saved edits for its ID. Reset and import replacement retain a recoverable previous revision.

Invalid persisted payloads are never automatically replaced with a sample. The app shows recovery mode using a sample workspace while retaining the original storage bytes and pausing saves. Users can download original recovery data. “Start recovery workspace” explicitly writes and read-verifies a protected copy before replacing corruption. The protected archive retains earlier recovery payloads. This is local recovery, not server backup, collaboration, or an unlimited revision history; users should export important work.

## Audit finding disposition and evidence

“Fixed” below means the audited failure has a code change plus an automated regression. It does not imply the broader industrial model is complete. Historical reproduction snippets in the audit documents intentionally assert baseline defects and should not be used as the implementation's passing tests.

| Finding | Disposition | Evidence |
| --- | --- | --- |
| P0-001 cyclic edit crashes app | Fixed | `project-validation.test.ts` cycles/deep graphs; optimizer closed-modal regression; browser cyclic edit retains graph and usable dashboard |
| P0-002 invalid attainment/certification | Fixed | Engineering reversed/cyclic/empty cases; view tests for all five report states; browser report status and no certification |
| ENG-001 day/period units | Fixed | Golden five-day fixture; report/KPI/scenario tests; browser five-day daily/period assertions |
| ENG-002 backlog omitted from totals | Fixed | Allocation-invariant work/VA/labor-bound test; KPI/scenario whole/allocated tests |
| ENG-003 machine capacity accelerated by headcount | Fixed conservatively | Fixed100s machine stays100s with extra worker; unsupported status; optimizer and browser multi-operator checks |
| ENG-004 labor bound called physical minimum | Fixed for supported model | Result/UI label updated; total-work lower-bound regression and view assertion |
| ENG-005 OEE/ideal-output ambiguity | Fixed by explicit contract | OEE-informational assumption test and report disclosure; effective-good-output scheduling remains unimplemented |
| OPT-001 leveling discards moves | Fixed | Actual changed allocation, task/metadata conservation, immutable inputs, canonical recomputation tests |
| OPT-002 generated ID collision | Fixed | RPW/LPT retained/generated IDs/codes collision regressions |
| OPT-003 inconsistent operator calculations | Fixed for conservative model | All algorithms use returned-plan evaluator metrics; mixed-operator unsupported tests |
| OPT-004 infeasible proposal can apply/save | Fixed | Invalid target/oversize/unsupported outcomes and component regressions asserting disabled Apply/Save controls |
| DATA-001 incomplete JSON/storage accepted | Fixed | Full project/scenario validation; storage protection tests; browser invalid JSON preserves workspace and corrupt storage requires explicit recovery |
| DATA-002 partial import replaces work | Fixed | Atomic parser rejection; browser mixed valid/invalid CSV leaves project unchanged; import review/cancel and replacement recovery |
| DATA-003 lost prerequisites/ambiguous codes | Fixed | Missing/duplicate/self/cyclic edge and unique-code tests; browser unknown predecessor rejection |
| DATA-004 multiline/nonfinite CSV | Fixed | Full-record round trip with CR/LF/quotes/Unicode; finite full-string numeric and malformed-quote tests |
| DATA-005 task edit loses qualifications | Fixed | Metadata-preserving draft tests and browser no-op task equality including qualifications, comma-containing tools, and extension metadata |
| DATA-006 invisible storage failures/preset loss | Fixed within local-storage workflow | Quota/rollback/corruption/catalog tests; browser inline failed save, custom-project menu, project switch/reload, previous revision and explicit recovery |
| DATA-007 duplicate station codes redirect CSV | Fixed | Free code generation checks existing case-normalized codes; parser rejects ambiguous station codes; browser delete/add uniqueness |
| UI-001 stale operating parameters | Fixed | Draft initialization on opening/context change; browser project switch, scenario activation, cancel/reopen, and no-edit save |
| UI-003 false Yamazumi geometry | Fixed | Dedicated360px common plot, nonshrinking bars and external labels; browser actual pixel baselines, heights and takt crossings in both stack modes |
| UI-004 background keyboard actions | Fixed | Shared native modal plus explicit focus cycling; browser forward/reverse tab, attempted background deletion, Escape and focus return across dialogs |
| QA-001 missing meaningful tests/CI | Regression suite and CI added | `npm test`, `npm run test:browser`, and `.github/workflows/ci.yml`; hosted CI execution must be confirmed on the remote PR |
| UI-002 narrow-screen navigation | Open | Existing desktop navigation breakpoint is unchanged; compact/mobile navigation remains later UI work |
| SEC-001 spreadsheet formulas | Open | CSV still preserves formula-leading text. Open untrusted exports as text or use JSON; spreadsheet-safe export policy and application-specific execution testing remain necessary |

## Verification

Run from the repository root with the published dependencies:

```sh
npm run lint
npm test
npm run build
npm run test:browser
```

`lint` is the repository's TypeScript check. The Node test command includes utility and component regressions, retaining the existing eight cases. Browser verification uses Python Playwright, a fresh Chromium context for each case, and its own Vite process on an available loopback port; it terminates only processes it starts. The suite installs nothing and disables HMR for deterministic checks. It uses `CHROMIUM_EXECUTABLE`, system Chromium, or Playwright's provisioned Chromium. Python dependency is pinned in `tests/browser/requirements.txt`; CI provisions that browser and executes all four commands. Browser prerequisites were already available in the current cloud machine.

Final local verification on2026-10-17:

| Command | Executed result |
| --- | --- |
| `npm run lint` | Passed, exit0 |
| `npm test` |95 passed,0 failed,0 skipped |
| `npm run build` | Passed, exit0; only the baseline Vite `__dirname` warning |
| `npm run test:browser` |27 Chromium tests passed in33.633s, with no uncaught page errors |
| `git diff --check` | Passed |

The exact implementation commit is reported with the pull request. No hosted CI result, production qualification, or remote PR creation should be inferred from a successful local run.

## Remaining limits

- Resource-constrained, multi-operator, shared-machine/fixture, stochastic, skill, ergonomic, and effective-good-output scheduling remain unsupported. RPW/LPT and adjacent-move leveling are heuristics, not proofs of optimality; leveling is bounded to50 passes.
- The project remains browser-local. The previous revision and per-project catalog are recoverable local copies, not protection against cleared browser data, device loss, cross-tab concurrent edits, or all storage failures. Schema migration/version history is future work.
- JSON preserves full project metadata. CSV represents its documented task fields and is not a complete project backup or a lossless interchange format for arbitrary extension metadata.
- Mobile navigation and spreadsheet formula hardening remain open as listed above. Accessibility fixes focus on safe dialogs and associated form labels; full accessibility conformance has not been assessed.
- Baseline dependency constraints and missing lockfile are unchanged. The existing Vite/esbuild peer conflict still requires compatibility installation in CI; dependency pinning and the nonblocking Vite `__dirname` warning are separate maintenance work.
- The implementation is stacked on the audit branch; a PR into that branch contains only implementation changes. Publication, a main-branch merge, hosted CI, and physical engineering sign-off are separate actions.

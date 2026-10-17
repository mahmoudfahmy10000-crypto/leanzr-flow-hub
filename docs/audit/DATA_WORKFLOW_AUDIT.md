# Data integrity, persistence, and workflow audit

Audit date: 2026-10-17. Baseline: `fe7f9fa7b2d059f1f34c30bfd887dd638de2ae70` (`main`). Scope: project restore, task CSV, task and parameter editors, project switching, local persistence, and export security. This review changed no application files.

The application is a browser-local planning tool. Its principal data boundary is file import and its persistence boundary is `localStorage`. TypeScript interfaces describe objects at compile time; they do not validate imported or persisted JSON. Current boundaries admit invalid engineering inputs and several normal workflows discard information.

P1 here means a reproducible failure that loses user work, changes the modeled routing or qualifications, corrupts numerical inputs, or makes normal project workflows unavailable. P2 means a bounded hardening or usability issue. None of the data findings alone proves an externally exploitable server compromise, and task qualification metadata is not presently enforced as a safety control.

## Findings register

| ID | Priority | Finding | Evidence |
| --- | --- | --- | --- |
| DATA-001 | P1 | Project restore accepts structurally incomplete JSON; persisted projects lack a complete schema check | Source inspection; actual storage-module probe; synthetic App handler probe |
| DATA-002 | P1 | Partial CSV import replaces all current tasks and masks errors with a success notification | Source inspection; actual CSV-module and synthetic App handler probes |
| DATA-003 | P1 | CSV silently removes unresolved prerequisites and resolves duplicate codes ambiguously | Actual CSV-module probes; task creation source inspection and synthetic handler probe |
| DATA-004 | P1 | Exported multiline CSV does not round-trip; nonfinite task durations pass validation | Actual CSV-module probes |
| DATA-005 | P1 | Saving an existing task deletes its qualification metadata | Source inspection and synthetic TaskModal submission probe |
| DATA-006 | P1 | Persistence failures are invisible; selecting a preset overwrites the only active project copy | Actual storage-module and synthetic App handler probes |
| DATA-007 | P1 | Delete/add station workflow duplicates station codes and changes assignments on CSV reimport | Source inspection; synthetic App handlers followed by actual CSV-module probes |
| UI-001 | P1 | Operating-parameter form retains values from a different project | Source inspection and synthetic OperatingParamsModal submission probe; see validation report for browser evidence |
| SEC-001 | P2 | Spreadsheet formula text is exported without neutralization | Actual CSV-export probe; spreadsheet execution not tested |

Synthetic probes execute the repository's component functions and event handlers using a minimal in-memory hook dispatcher. They establish state transitions in those handlers, but do not establish browser rendering, accessibility, or full React lifecycle behavior. Actual-module probes call the repository utilities directly. The separate validation report records browser checks.

## DATA-001: require a complete project schema before restore

[JSON import](../../src/App.tsx#L224) accepts any object with `tasks` and `stations` arrays, then immediately replaces the current project. Importing `{"tasks":[],"stations":[]}` reaches `calculateLineMetrics`, which reads missing operating parameters and throws `Cannot read properties of undefined (reading 'hoursPerShift')`. The application has no render error boundary in [its entry point](../../src/main.tsx#L5). The shallow acceptance condition does not verify IDs, project metadata, parameter bounds, task shape, scenario shape, or references.

[Stored-project loading](../../src/utils/storage.ts#L11) checks only a truthy project ID and the two arrays. A stored object such as `{"id":"malformed","tasks":[],"stations":[]}` passes loading and fails during calculation. A missing `scenarios` array may remain unnoticed until the [scenario view](../../src/components/ScenarioCompare.tsx#L43) calls `.map`. Malformed JSON that cannot load falls back to a benchmark; the [unconditional autosave effect](../../src/App.tsx#L54) can then overwrite the original stored payload with the fallback. A JSON import that fails during rendering should not be claimed as durably saved: the render may fail before its save effect runs.

Expected: validation rejects the entire candidate before changing the workspace, preserves the current project, and explains actionable field errors. Introduce a shared, versioned runtime schema at import, storage read, and calculation/optimization boundaries. Validate finite positive times; demand, shift and downtime bounds; integer operator counts; unique IDs and codes; reference integrity; DAG constraints; scenarios; and optional metadata. Preserve an invalid stored payload for explicit recovery instead of silently overwriting it.

Acceptance: incomplete JSON, invalid task fields, invalid scenarios, duplicate IDs, dangling station references, and nonfinite numerical values leave the active project and recovery copy intact; valid complete JSON round-trips unchanged.

## DATA-002: make CSV import transactional

[The CSV handler](../../src/App.tsx#L238) reports `errors[0]`, but if even one valid row remains it replaces `prev.tasks` with that subset and immediately emits a success notification. In the reproduced EV benchmark workflow, importing one positive-duration row and one negative-duration row changed the task count from 14 to 1; the final notification was `Imported 1 tasks successfully!`. Autosave then stored that reduced project. No preview, replacement confirmation, recovery snapshot, or undo is implemented.

Expected: malformed rows cannot silently turn a partial parse into a successful replacement. Parse into a candidate, display all diagnostics with row references, and require an explicit import decision when replacement would discard current tasks. The default validation path should reject the candidate as a whole. An optional partial-import mode needs clear accounting and a recoverable previous version. Prevent an asynchronous file read from applying a candidate to a different project selected while the read was in progress.

Acceptance: a mixed valid/invalid file leaves all 14 benchmark tasks intact by default, explains the rejected row, and never displays unconditional success; an accepted replacement can be undone or restored from a retained snapshot.

## DATA-003: preserve graph identity and reject ambiguous codes

[Prerequisite resolution](../../src/utils/export-import.ts#L170) appends a reference only when the token exists in `codeToIdMap`. Unknown tokens disappear with no error. A row for task `A` with predecessor `MISSING` imports with `predecessors: []` and `errors: []`. This changes the manufacturing routing rather than merely cleaning presentation data.

[Code insertion](../../src/utils/export-import.ts#L150) overwrites existing map entries. Two rows coded `A`, with the second declaring predecessor `A`, produce a self-dependent second task without an error. [Task creation](../../src/components/TaskModal.tsx#L51) generates codes from task count, and [saving](../../src/components/TaskModal.tsx#L74) does not check uniqueness: deleting two EV tasks gives the next new task the already-existing code `OP-130`. Since CSV uses codes to reconstruct graph references, accepting duplicate codes also breaks export/import identity.

Expected: stable internal identity and unique project-visible codes; every unresolved prerequisite is a blocking diagnostic. Detect duplicate codes, self-dependencies, cycles, and dangling references before committing any import or task edit. Generate the next available code by checking existing codes instead of using array length. The shared graph validation must also cover task-editor changes; excluding self from the checkbox list alone does not prevent a multi-task cycle.

Acceptance: unknown prerequisite codes and duplicate codes reject the candidate without dropping an edge; self and multi-node cycles are diagnosed; delete/create operations cannot generate an existing code; valid graph edges survive a CSV round-trip.

## DATA-004: implement a real CSV record parser and strict finite numbers

The exporter [quotes embedded newlines](../../src/utils/export-import.ts#L19), but the importer [splits physical lines before parsing quoted fields](../../src/utils/export-import.ts#L59). A task description `First instruction\nSecond instruction` exports quoted correctly, then imports as `First instruction` with no errors. A multiline task name can likewise split or shift data rows. Parsing each line independently cannot meet the file's stated RFC-4180 support. Unbalanced quoting is not rejected, and unconditional `.trim()` changes significant whitespace inside quoted fields.

[Duration parsing](../../src/utils/export-import.ts#L120) uses `parseFloat` and rejects only `NaN` or values `<= 0`. The literal `Infinity` is accepted; JSON serialization turns that duration into `null`, introducing another change on backup/autosave. Prefix strings such as `10seconds` are accepted as `10`. These are engineering inputs, so accepting a parseable prefix is insufficient.

Expected: parse records with a maintained RFC-4180 parser or a validated full-text state machine; preserve quoted newlines, carriage returns, quotes, and significant whitespace. Validate the entire numeric string and require `Number.isFinite(duration) && duration > 0` before creating a task. Apply consistent numeric rules at every input boundary.

Acceptance: names and SOP descriptions containing commas, quotes, CRLF, and embedded newlines round-trip; malformed quote structures report row/record diagnostics; `Infinity`, `NaN`, overflow such as `1e309`, and trailing units are rejected without replacing current data.

## DATA-005: preserve task qualifications during editing

[TaskModal submission](../../src/components/TaskModal.tsx#L74) constructs a fresh `Task` object from editable fields and omits `requiredSkills`. [The App replaces the original task](../../src/App.tsx#L126) with that object. Opening the EV benchmark's first task and saving without edits removes `['Battery Tech L1', 'ESD Safety']`. Other seed tasks contain laser and high-voltage qualification labels. The application does not currently enforce operator qualifications, so this finding establishes metadata loss rather than a demonstrated bypass of an enforcement system.

Expected: editing one field preserves all fields outside the editor's scope. Preserve the original object before applying validated edits, or explicitly include all supported domain fields. If qualifications become editable, provide dedicated validation and human-readable qualification names.

Acceptance: a no-op save preserves the complete task, including `requiredSkills`; changing duration or description retains qualification and tool metadata; JSON backup preserves the same fields.

## DATA-006: expose save status and retain projects independently

[Saving](../../src/utils/storage.ts#L27) catches write failures and logs to the console, returns no success status, and mutates `project.lastModified` before durable persistence succeeds. A simulated `QuotaExceededError` returns `undefined`, indistinguishable from success to the caller, with no user-visible failure state. A long-lived session can therefore continue displaying edits that will disappear on refresh.

[Preset selection](../../src/components/TopNav.tsx#L83) always selects immutable benchmark objects. [The handler](../../src/App.tsx#L69) replaces the active project and the autosave effect writes the same single active-project key. Reproduced: edit the first station name, select another benchmark, then select the original benchmark; the custom station name is replaced by its seed name. The [saved-project list helpers](../../src/utils/storage.ts#L36) are not connected to App or TopNav, so they provide no project-retention workflow. Reset, scenario activation, and other replacement operations likewise need deliberate recovery behavior; the current scenario snapshot function can retain a copy only when invoked before the destructive action.

Expected: show persistent saved/saving/failed status, return structured write errors, and offer JSON download when storage is unavailable or full. Keep separately stored projects indexed by project ID; selecting a benchmark should clearly create/reset a workspace rather than silently discard a user's edited project. Retain a recoverable previous revision before replacements. Do not claim durability from a timestamp update alone.

Acceptance: quota-denied writes visibly remain unsaved and permit export; switching away and back restores edits and snapshots; explicit reset/replacement provides recovery; a corrupt payload remains retrievable instead of being replaced silently.

## DATA-007: generate unique station codes

[Adding a station](../../src/App.tsx#L88) uses `stations.length + 1`. Starting from `ST-01` through `ST-05`, deleting `ST-02` and adding a station yields `ST-01, ST-03, ST-04, ST-05, ST-05`. Station IDs differ, so the board initially preserves their separate assignments, but [CSV export emits codes](../../src/utils/export-import.ts#L14) and [CSV import maps duplicate codes to the last station](../../src/utils/export-import.ts#L104).

Reproduced: the EV task `OP-110` was assigned to original station ID `st-5`; exporting and immediately parsing the CSV after that delete/add sequence reassigned it to the new station ID with `errors: []`. This is a routing change created by a normal UI workflow, with no malformed external file required.

Expected: generate a free code from the existing code set, validate uniqueness on restore/import/edit, and reject ambiguous station references. Unknown station codes should also generate a diagnostic instead of silently becoming backlog assignments.

Acceptance: the reproduced delete/add workflow generates a unique station code, and every assigned task returns to the same intended station on CSV reimport.

## UI-001: refresh operating parameters when the project changes

[OperatingParamsModal](../../src/components/OperatingParamsModal.tsx#L23) initializes `formData` from `params` once. [App keeps this component mounted](../../src/App.tsx#L368) while projects and scenario parameters change. In the synthetic probe, the modal mounted with demand 250, received a new project's demand 999, and submitted 250. A cancelled edit can also remain in component state and reappear when the modal opens again. [Submission](../../src/components/OperatingParamsModal.tsx#L32) then overwrites active operating parameters, so this stale form can change takt and optimizer inputs.

Expected: reinitialize a fresh form from the active project when the modal opens or project identity changes; cancel discards the draft. Keep open-form behavior explicit if the underlying project changes. Validate cross-field bounds, including planned downtime below gross shift time and physically feasible total scheduled hours.

Acceptance: switch project, activate scenario, or import a project, then open settings; every field equals the active project's parameters. Cancel/reopen restores the current saved values. Saving without edits cannot change takt.

## SEC-001: neutralize spreadsheet formulas in CSV exports

[CSV escaping](../../src/utils/export-import.ts#L19) handles commas, quotes, and LF but does not neutralize formula-leading cell values. A task name `=1+1` is exported directly as a formula cell. CSV supplied by another party can therefore carry spreadsheet formulas through import/export. The audit confirmed the exported bytes; it did not execute Excel, LibreOffice, external hyperlinks, or external-command payloads.

Expected: use a documented spreadsheet-safe export policy for text cells beginning with `=`, `+`, `-`, `@`, or relevant control characters. Preserve raw data separately in JSON. Test chosen escaping against the supported spreadsheet applications, since quoting alone does not neutralize formulas and prefixing may change round-trip text.

Acceptance: malicious formula text remains literal when opened in the supported spreadsheet applications; ordinary codes, negative numeric fields where allowed, and valid Unicode remain usable.

## Reproducible actual-module checks

Run the following from the repository root after the existing dependencies are available. It imports current utility modules directly, uses in-memory data, and does not edit tracked files or browser storage.

```bash
node --import tsx --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { exportTasksToCSV, parseTasksCSV } from './src/utils/export-import.ts';
const stations = [{id: 's1', code: 'ST-01', name: 'Station 1', operatorCount: 1}];
const task = {
  id: 'a', code: 'A', name: 'Operation A', duration: 10, category: 'VA',
  assignedStationId: 's1', predecessors: [], ergonomics: 'low',
  description: 'First instruction\nSecond instruction'
};
const header = 'Code,Name,Duration_s,Category,Station_Code,Predecessors,Ergonomics,Description';
const multiline = parseTasksCSV(exportTasksToCSV([task], stations), stations);
assert.equal(multiline.tasks[0].description, 'First instruction');
assert.deepEqual(multiline.errors, []);
const missing = parseTasksCSV(`${header}\nA,Assembly,10,VA,ST-01,MISSING,low,`, stations);
assert.deepEqual(missing.tasks[0].predecessors, []);
assert.deepEqual(missing.errors, []);
const duplicate = parseTasksCSV(`${header}\nA,First,10,VA,ST-01,,low,\nA,Second,10,VA,ST-01,A,low,`, stations);
assert.equal(duplicate.tasks[1].predecessors[0], duplicate.tasks[1].id);
const infinite = parseTasksCSV(`${header}\nA,Infinite operation,Infinity,VA,ST-01,,low,`, stations);
assert.equal(infinite.tasks[0].duration, Infinity);
assert.equal(JSON.parse(JSON.stringify(infinite.tasks))[0].duration, null);
assert.deepEqual(infinite.errors, []);
assert.ok(exportTasksToCSV([{...task, name: '=1+1'}], stations).includes(',=1+1,'));
console.log('Confirmed current defects: multiline loss, dropped edge, duplicate-code self-edge, nonfinite duration, formula output.');
JS
```

These assertions deliberately characterize current defects. After remediation they should be replaced by regression tests asserting rejection, preservation, and correct round-trip behavior. The temporary audit harness also exercised App, TaskModal, and OperatingParamsModal handlers, but no application test or production implementation was added in this documentation-only change.

## First implementation phase for this area

Build one validated domain boundary shared by import, restore, manual edits, calculation, and optimization. Add transactional candidates and recovery before broadening the workflow. Preserve task metadata and unique identifiers; make save failures visible; correct stale form initialization. Gate engineering recommendations on valid, complete, feasible models, using the graph and arithmetic requirements in the engineering audit. CSV compliance and spreadsheet-safe output can then be tested against that stable domain boundary.

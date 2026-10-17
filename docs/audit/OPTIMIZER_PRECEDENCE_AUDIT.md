# Optimizer and precedence audit

Baseline: `fe7f9fa7b2d059f1f34c30bfd887dd638de2ae70` (`main`). Scope: deterministic RPW/LPT packing, smoothness leveling, dependency validation, critical-path rendering, and optimization preview/application. This is a read-only engineering audit; no application or test changes are proposed in this documentation pull request.

**P0 means an engineering release blocker in this audit. It does not assert an active production incident.** Severity reflects reproducible invalid engineering behavior or loss of application usability. The findings below were reproduced against the actual exported functions and React components, using the existing Node/tsx installation.

| ID | Priority | Finding | Verified result |
| --- | --- | --- | --- |
| P0-001 | P0 | Cyclic edits crash even the closed optimizer | Two-node cycle returns no precedence errors, then throws `RangeError` during hidden modal rendering |
| OPT-001 | P1 | Leveling discards its own moves | Summary CT/SI = 40/10; returned assignments recompute to 60/50 |
| OPT-002 | P1 | Generated station IDs collide | 150 seconds of input work recomputes as 250 seconds |
| OPT-003 | P1 | Optimizer and dashboard use different operator models | Reported efficiency/SI = 100%/0; canonical metrics = 66.67%/30 |
| OPT-004 | P1 | Invalid target/partial plans remain applicable | A 120-second task is assigned under a 60-second limit; partial results have enabled Apply/Save controls |

## P0-001 — A cyclic edit crashes the application through the hidden optimizer

The task editor [excludes only the task itself from predecessor choices](../../src/components/TaskModal.tsx#L99), allowing an existing descendant to be selected. [Saving the task](../../src/App.tsx#L126) does not validate the resulting graph. [Station-based precedence validation](../../src/utils/engineering-math.ts#L61) cannot identify a same-station cycle. RPW's [successor recursion](../../src/utils/line-balancing-optimizer.ts#L43) memoizes only after visiting children and has no active-visit guard.

The optimizer [computes the result before checking `isOpen`](../../src/components/OptimizerModal.tsx#L65); the early return is at line 84. [App always mounts the modal](../../src/App.tsx#L375). Consequently, introducing a cycle can fail ordinary board rendering without opening Optimize. The precedence graph also has [unguarded earliest-finish recursion](../../src/components/PrecedenceGraph.tsx#L90), despite its separate layout function attempting to break cycles. No error boundary was found in `src`.

Reproduction: assign A=10s and B=10s to s1, with A depending on B and B depending on A; use one operator and takt=100s. Observed:

- `validatePrecedence` returns `[]` and `calculateLineMetrics` returns `taktAttainmentAchieved=true`.
- RPW throws `RangeError: Maximum call stack size exceeded`.
- Rendering the actual `OptimizerModal` with `isOpen=false` throws the same error.
- Rendering `PrecedenceGraph` throws the same error.

Expected behavior: graph edits and imported graphs must reject cycles with an actionable explanation, preserve the previous valid project, and keep the board usable. Every graph consumer needs safe invalid-input handling. A recoverable UI boundary and skipping closed-modal computation are useful defenses; neither substitutes for engineering graph validation.

## OPT-001 — Smoothness leveling reports improvements that it never returns

The function [stores original tasks in `taskMap`](../../src/utils/line-balancing-optimizer.ts#L367) while placing clones in station buckets at line 373. It [updates the cloned assignment](../../src/utils/line-balancing-optimizer.ts#L453), then [builds the returned tasks from unchanged originals](../../src/utils/line-balancing-optimizer.ts#L465). Its [move-validity check](../../src/utils/line-balancing-optimizer.ts#L381) also reads original assignments after internal moves have happened.

Input: s1/s2, one operator each; A40+B20 on s1, C10 on s2; limit=100s. Observed return: CT=40, SI=10, efficiency=87.5%, summary says convergence in three passes. Returned assignments remain A→s1, B→s1, C→s2. Recalculation gives CT=60, SI=50, efficiency=58.33%.

The modal [recomputes preview metrics from returned tasks](../../src/components/OptimizerModal.tsx#L75) and [prints the separate optimizer summary](../../src/components/OptimizerModal.tsx#L282), so these disagree; Apply saves the unchanged plan. Input mutation was checked and was **not observed**. This finding is stale returned data, not mutation of the original project during preview.

Expected behavior: one authoritative cloned assignment model must drive moves, dependency checks, returned tasks, and summary metrics. Validate the final returned plan independently.

## OPT-002 — Generated station identities can collide with retained stations

Both [RPW station creation](../../src/utils/line-balancing-optimizer.ts#L196) and [LPT station creation](../../src/utils/line-balancing-optimizer.ts#L309) reuse existing IDs while generating unreserved IDs in the form `station-${idx + 1}`. Retained metadata and generated identities are not checked for uniqueness.

Input: one existing station whose unique ID is `station-2`; three independent 50-second tasks; target=50s. Either optimizer returns station IDs `[station-2, station-2, station-3]`. A and B share `station-2`. [Metric grouping by ID](../../src/utils/engineering-math.ts#L113) followed by [one calculation per station row](../../src/utils/engineering-math.ts#L129) counts A+B twice: 150 seconds becomes 250 seconds. Duplicate React keys and ambiguous station references also follow.

This does not require malformed duplicate-ID input. A valid imported project can have that ID. The state can also arise when a previous optimization generated `station-2`, an earlier station is deleted, and optimization is repeated.

Expected behavior: retain existing identities, reserve all used IDs, generate collision-free new identities, and enforce uniqueness and work conservation before application.

## OPT-003 — Packing and result metrics disagree about operator capacity

[RPW](../../src/utils/line-balancing-optimizer.ts#L153) and [LPT](../../src/utils/line-balancing-optimizer.ts#L271) pack raw station workload against the cycle limit, then retain existing operator counts. Their [RPW result metrics](../../src/utils/line-balancing-optimizer.ts#L217) and [LPT result metrics](../../src/utils/line-balancing-optimizer.ts#L329) ignore those counts. The canonical [station calculation divides work by operator count](../../src/utils/engineering-math.ts#L131), and its [efficiency uses total operators](../../src/utils/engineering-math.ts#L197).

Input: independent A60+B60; target=60s; retained s1 with two operators. Either algorithm produces two stations and three operators, with reported efficiency=100% and SI=0. Canonical recomputation yields station cycles 30/60, efficiency=66.67%, SI=30. Under the application's own divisible-work assumption, both tasks could fit the retained two-operator station at 60s.

Leveling has an additional arithmetic inconsistency: it [sums station times already divided by operators](../../src/utils/line-balancing-optimizer.ts#L470) and divides that sum by total operators again at line 476. With one station, two operators and one 120-second task, its reported efficiency is 50%; canonical recomputation is 100%, even though no moves occur.

Expected behavior: define a supported operator/parallelism model and use it consistently for packing, feasibility, comparison, and reporting. Simply dividing every station's workload by headcount is not proof that a single indivisible operation, sequential work, or fixed machine cycle can run twice as fast. Model assumptions must be explicit before prescribing a replacement formula.

## OPT-004 — Target-infeasible and incomplete results have enabled Apply/Save actions

The [RPW fallback](../../src/utils/line-balancing-optimizer.ts#L174) and [LPT fallback](../../src/utils/line-balancing-optimizer.ts#L290) deliberately assign an overlong task to an empty station. A 120-second operation under a 60-second target returns assigned, with zero unassigned tasks; RPW calls the result “balanced” with 100% efficiency. A 20-second operation referencing a nonexistent predecessor returns unassigned while both summaries still say one task was balanced.

The [modal footer](../../src/components/OptimizerModal.tsx#L288) always enables Save/Apply. It does not use `unassignedTasksCount` or final feasibility, and the result type has no structured feasibility state. The over-target CT is visible in the preview; the issue is the lack of an explicit failure/partial outcome and an application gate, not concealment of the CT.

Expected behavior: return feasible/infeasible/partial status with violated constraints and missing references. Require all task assignments, graph constraints, resource constraints and requested limits to pass before offering a result as feasible. If exploratory over-target scenarios are allowed, label them explicitly and preserve their failure reasons.

## First implementation phase and acceptance criteria

Start with a shared runtime/domain validation boundary and a written resource/parallelism contract. Reject cycles, duplicate identities, dangling references and invalid numeric data; distinguish numerical takt comparison from a valid feasible plan. Repair the leveling return model, reserve generated station IDs, and derive every optimizer metric from the returned plan. Add these regression checks before adding further heuristics:

| Area | Required checks |
| --- | --- |
| Graph safety | Self-loop, two-node and long cycles, diamond DAG, missing predecessor, disconnected DAG, closed/open modal, graph rendering |
| Assignment integrity | Every task assigned exactly once or explicitly reported unassigned; unique station/task IDs; valid references; conserved total work |
| Leveling | At least one real assignment change on an improvable fixture; recomputed metrics equal returned metrics; original inputs unchanged; dependent moves use current assignments |
| Labor/resource semantics | Mixed operator counts, indivisible operations, sequential same-station work, fixed-time machine tasks, allowed parallelism |
| Result acceptance | Overlong task, nonpositive/nonfinite target, empty line, missing prerequisite, partial plan, explicit infeasibility presentation and blocked feasible-apply path |

Existing optimizer coverage is [three tests on one four-task fixture](../../src/utils/line-balancing-optimizer.test.ts#L19), all with single-operator stations. The RPW test's precedence comment is followed only by truthy-assignment checks, not an assertion of predecessor station order. There is no leveling, cyclic-graph, identity-collision, mixed-operator, infeasible-target, or result-recomputation regression. `package.json` has no test script; the existing tests are runnable through tsx.

The implementation is a duration/precedence heuristic. Skills, fixtures and workplace-capacity fields are metadata, with no station capability matching, machine occupancy, transfer, ergonomic exposure, or stochastic simulation model. This limits claims of operational feasibility; it is not evidence that a particular real-world machine or safety incident occurred.

## Runnable reproduction

Run the following from the repository root after the published environment's existing dependencies are available. It uses actual source modules and React server rendering, creates no repository files, and asserts the **currently observed defects**. After implementation fixes, the corresponding assertions should fail and be replaced by positive regression tests in that separate coding change.

```bash
node --import tsx --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { runRPWOptimization, runLPTOptimization, runSmoothnessLeveling } from './src/utils/line-balancing-optimizer.ts';
import { calculateLineMetrics, validatePrecedence } from './src/utils/engineering-math.ts';
import { OptimizerModal } from './src/components/OptimizerModal.tsx';
import { PrecedenceGraph } from './src/components/PrecedenceGraph.tsx';

const task = (id, duration, assignedStationId = null, predecessors = []) => ({
  id, code: id, name: id, duration, assignedStationId, predecessors,
  category: 'VA', ergonomics: 'low',
});
const station = (id, operatorCount = 1) => ({ id, code: id, name: id, operatorCount });
const params = {
  demandUnitsPerPeriod: 36, demandPeriodDays: 1, shiftsPerDay: 1,
  hoursPerShift: 1, plannedDowntimeMinutesPerShift: 0,
  oeeTargetPercent: 100, targetBufferPercent: 0,
}; // 3600 / 36 = 100 seconds takt

const cyclic = [task('A', 10, 's1', ['B']), task('B', 10, 's1', ['A'])];
const cyclicMetrics = calculateLineMetrics([station('s1')], cyclic, params);
assert.deepEqual(validatePrecedence(cyclic, [station('s1')]), []);
assert.equal(cyclicMetrics.taktAttainmentAchieved, true);
assert.throws(() => runRPWOptimization(cyclic, 100), RangeError);
assert.throws(() => renderToString(React.createElement(OptimizerModal, {
  isOpen: false, onClose() {}, tasks: cyclic, stations: [station('s1')],
  params, currentMetrics: cyclicMetrics, onApplyOptimization() {}, onSaveAsScenario() {},
})), RangeError);
assert.throws(() => renderToString(React.createElement(PrecedenceGraph, {
  tasks: cyclic, stations: [station('s1')], onSelectTask() {},
})), RangeError);
console.log('P0-001: cyclic graph endorsed; RPW, closed modal, and graph throw RangeError');

const levelingInput = [task('A', 40, 's1'), task('B', 20, 's1'), task('C', 10, 's2')];
const before = JSON.stringify(levelingInput);
const leveled = runSmoothnessLeveling([station('s1'), station('s2')], levelingInput, 100);
const actual = calculateLineMetrics(leveled.stations, leveled.tasks, params);
assert.equal(JSON.stringify(levelingInput), before); // no preview mutation observed
assert.deepEqual(leveled.tasks.map(t => t.assignedStationId), ['s1', 's1', 's2']);
assert.equal(leveled.maxCycleTime, 40);
assert.equal(leveled.smoothnessIndex, 10);
assert.equal(actual.bottleneckCycleTime, 60);
assert.equal(actual.smoothnessIndex, 50);
console.log('OPT-001: reported CT/SI 40/10; returned tasks recompute to 60/50');

const twoOperatorLeveling = runSmoothnessLeveling([station('s1', 2)], [task('A', 120, 's1')], 100);
assert.equal(twoOperatorLeveling.efficiencyPercent, 50);
assert.equal(calculateLineMetrics(twoOperatorLeveling.stations, twoOperatorLeveling.tasks, params).lineBalancingEfficiencyPercent, 100);
console.log('OPT-003 leveling: efficiency 50%; canonical recomputation 100%');

for (const [name, optimize] of [['RPW', runRPWOptimization], ['LPT', runLPTOptimization]]) {
  const collision = optimize([task('A', 50), task('B', 50), task('C', 50)], 50, [station('station-2')]);
  const collisionMetrics = calculateLineMetrics(collision.stations, collision.tasks, params);
  assert.deepEqual(collision.stations.map(s => s.id), ['station-2', 'station-2', 'station-3']);
  assert.equal(collisionMetrics.totalWorkContentSeconds, 250); // actual input = 150s
  console.log(`OPT-002 ${name}: duplicate station IDs; input work 150s recomputes as 250s`);

  const mixed = optimize([task('A', 60), task('B', 60)], 60, [station('s1', 2)]);
  const mixedMetrics = calculateLineMetrics(mixed.stations, mixed.tasks, params);
  assert.equal(mixed.stationsCount, 2);
  assert.equal(mixedMetrics.actualOperatorsCount, 3);
  assert.equal(mixed.efficiencyPercent, 100);
  assert.ok(Math.abs(mixedMetrics.lineBalancingEfficiencyPercent - 66.66666666666667) < 1e-9);
  assert.equal(mixed.smoothnessIndex, 0);
  assert.equal(mixedMetrics.smoothnessIndex, 30);
  console.log(`OPT-003 ${name}: reported efficiency/SI 100/0; canonical metrics 66.67/30`);

  const overTarget = optimize([task('A', 120)], 60);
  assert.equal(overTarget.maxCycleTime, 120);
  assert.equal(overTarget.unassignedTasksCount, 0);
  const incomplete = optimize([task('A', 20, null, ['missing'])], 60);
  assert.equal(incomplete.unassignedTasksCount, 1);
  assert.equal(incomplete.tasks[0].assignedStationId, null);
  console.log(`OPT-004 ${name}: 120s operation accepted under 60s limit; missing prerequisite returns partial plan`);
}
NODE
```

Verified output: all assertions completed successfully; P0-001 and OPT-001–OPT-004 reproduced. The script executes the same RPW/LPT cases independently for both algorithms.

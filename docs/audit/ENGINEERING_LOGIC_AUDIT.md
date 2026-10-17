# Engineering Logic Audit

Audit date: 2026-10-17. Repository: `mahmoudfahmy10000-crypto/leanzr-flow-hub`. Baseline: `fe7f9fa7b2d059f1f34c30bfd887dd638de2ae70`.

The deterministic single-operator formulas work for the tested valid cases. The engineering release gate is nevertheless **not satisfied**: an invalid routing can be reported as attaining takt, and the printable report labels it “Certified” without a validation or approval decision. Capacity and workload calculations also need clear time-horizon, allocation, and resource contracts before they can support production decisions.

This is a source and executable-fixture audit, not verification of a physical production line. No measured cycle-time study, machine specification, plant operating data, or professional approval was available. The documentation-only change does not implement the recommendations below.

## Scope and severity

Scope covers the calculation engine, domain types, precedence interpretation, KPI presentations, scenario comparisons, and printable engineering report. Source links are relative to `docs/audit/` and refer to the audited baseline.

**P0 means an engineering release gate in this audit.** It means that the product must not present a configuration as engineering-approved until the gate is resolved. It does not claim a current production outage, an observed safety incident, or demonstrated plant harm. P1 identifies substantial correctness defects or unsupported model contracts; P2 identifies narrower semantic and capability gaps. A “model-contract defect” means the software states a result more strongly than its recorded assumptions and constraints justify.

## Formula and assumption review

Let `d` be planning days, `s` shifts/day, `h` gross hours/shift, `p` planned downtime minutes/shift, `D` demand over the planning period, `b` buffer as a fraction, `Wj` allocated station work content, `mj` station workforce, and `Cmax` the largest station cycle.

| Quantity | Current calculation | Assessment and validity conditions |
| --- | --- | --- |
| Net time per planning period | `d × s × max(0, 60h − p) × 60` | Correct for valid inputs and a repeated daily schedule. It is period time, despite the result field later being named `availableTimeSecondsPerDay`. Invalid schedules need an error state rather than silently implying a viable plan. |
| Customer takt | `Tperiod / D` | Correct when time and demand use the same planning period and both are positive. Customer takt should remain separate from internal capacity derating. |
| Buffered target cycle | `takt × (1 − b)`; buffer clamped to 0–50% | Correct for the stated policy of a fractional margin below takt. This is a planning target, not a measured cycle or proof of feasibility. The editing form caps the entered buffer at 40%, while the engine permits 50%; document one contract. |
| Station cycle | `Wj / mj` | An ideal divisible-labor estimate. It is not generally a feasible machine/resource-constrained cycle. It needs explicit parallelism, indivisibility, operator scheduling, and resource assumptions. |
| Bottleneck | `max(station cycle)` | Correct for the deterministic serial-line model once each station cycle is credible. It does not model variability, starvation, blocking, startup, failures, or finite buffers. |
| Labor-content lower bound | `ceil(sum(allocated work) / takt)` | Correct as a labor lower bound under its assumptions; incorrectly named a general minimum number of workstations. It also excludes backlog work. A lower bound is not an achievable balance. |
| Balance efficiency | `100 × allocated work / (total operators × Cmax)` | Reproduces the standard single-operator case. With multiple operators, its interpretation depends on the station-cycle and labor-content model. It is not OEE. |
| Balance loss | `100 − balance efficiency` | Consistent with the preceding formula. |
| Smoothness index | `sqrt(sum((Cmax − Cj)^2))` | Reproduces the standard station-cycle calculation. It is a dispersion measure, not a proof of throughput or resource feasibility. Multi-operator comparisons need a stated convention. |
| Nominal hourly output | `floor(3600 / Cmax)` | A deterministic nominal estimate, conditional on a valid nonempty routing and credible station cycles. Flooring gives whole units per assumed hour, rather than a continuous average rate. |
| Nominal daily output | `floor(Tperiod / Cmax)` | Numerically a **period** output; mislabeled daily whenever `d ≠ 1`. |
| VA ratio | `100 × allocated VA work / allocated total work` | Valid as an allocated-work ratio. Misleading when labeled as the whole project's VA ratio because unassigned work is omitted. |
| Takt attainment | Positive takt, `Cmax ≤ takt`, and no unassigned tasks | Incomplete. Does not require a nonempty routing, valid DAG, valid precedence, or supported resource model. |
| Graph longest path | `duration(task) + max(predecessor earliest finish)` | A precedence-only lower bound on product processing latency for a valid DAG. It is not the steady-state production interval. Cycles are not guarded in this calculation. |
| OEE-adjusted good output | No calculation | The parameter exists but is unused. An explicit ideal-versus-effective-output contract is needed; multiplying unrelated numbers without defining measured losses can double count them. |

Formula sources: [time and target calculations](../../src/utils/engineering-math.ts#L14-L43), [station and line calculations](../../src/utils/engineering-math.ts#L109-L251), [domain result fields](../../src/types/flowlab.ts#L35-L85), and [graph earliest finish](../../src/components/PrecedenceGraph.tsx#L87-L106).

## Findings

### P0-002 — Invalid configurations can attain takt and receive an automatic certificate

**Priority:** P0 engineering release gate. **Status:** reproduced.

The [attainment predicate](../../src/utils/engineering-math.ts#L224) is evaluated without incorporating the [precedence errors calculated afterward](../../src/utils/engineering-math.ts#L230). For tasks A and B of 5 seconds each, assign A to S2 and its dependent B to S1 at a 10-second takt. The engine returns one sequence error and `taktAttainmentAchieved: true`. The [scenario table displays “Attained”](../../src/components/ScenarioCompare.tsx#L193-L201) from that boolean.

The [precedence validator](../../src/utils/engineering-math.ts#L61-L89) also skips missing predecessor IDs and checks station order without validating acyclicity. Co-locating mutually dependent A and B at S1 returns zero precedence errors and an attained status. The task editor [excludes only a task itself from the candidate list](../../src/components/TaskModal.tsx#L91-L100), so an indirect cycle is possible through ordinary edits. Rendering this cycle in the [unguarded earliest-finish traversal](../../src/components/PrecedenceGraph.tsx#L90-L106) throws `RangeError: Maximum call stack size exceeded`.

Independently of validity, the [report header always prints “LINE BALANCING AUDIT CERTIFICATE” and “Certified”](../../src/components/PrintReportView.tsx#L66-L70). Rendering the cyclic fixture produces those claims and no precedence warning. The report has no modeled approval state or recorded engineering sign-off; the signature lines are blank presentation fields. An empty task list also returns attainment `true` while capacity is zero.

**Expected:** one shared assessment of numeric validity, graph validity, assignment completeness, nonempty work, resource assumptions, and takt/capacity status. Invalid, incomplete, unknown, over-takt, and feasible states must be distinguishable. Passing an automatic calculation must not silently create a professional approval claim.

**Recommended acceptance gate:** reject cycles and unresolved references before calculation/optimization; make invalidity visible in every consumer; prevent invalid configurations from being labeled attained or approved; replace unconditional certification with a clearly modeled review state. Keep any approval decision separate from mathematical feasibility.

### ENG-001 — Planning-period totals are presented as daily time and daily output

**Priority:** P1. **Status:** reproduced.

[Available time includes `demandPeriodDays`](../../src/utils/engineering-math.ts#L18-L21), but it is assigned to [`availableTimeSecondsPerDay`](../../src/utils/engineering-math.ts#L105) and used to compute [`dailyProductionCapacity`](../../src/utils/engineering-math.ts#L220-L222). The [KPI](../../src/components/KPIRow.tsx#L134-L137), [report](../../src/components/PrintReportView.tsx#L100-L117), and [scenario output/delta](../../src/components/ScenarioCompare.tsx#L186-L188) display daily units.

**Fixture:** one hour/day, no downtime, CT 10 seconds. A one-day plan for 360 units reports 3,600 seconds and 360 units/day. Changing to five days and 1,800 units keeps takt at 10 seconds, but reports 18,000 seconds as daily time and 1,800 units/day.

**Expected:** 3,600 available seconds/day and 360 units/day in both cases; five-day totals of 18,000 seconds and 1,800 units in separately named period fields. Compare capacity and demand over the same horizon. The current demand comparison is period-to-period internally, but its daily label misrepresents what it compares.

**Acceptance:** paired plans with identical daily schedules and proportional period demand have identical daily results; period results scale with the planning horizon. Scenario deltas must use normalized units or disclose different horizons.

### ENG-002 — Unassigned work vanishes from project totals and VA ratio

**Priority:** P1. **Status:** reproduced.

Tasks without a recognized assignment enter the [unassigned collection](../../src/utils/engineering-math.ts#L115-L120), but [total work and total VA are accumulated only inside station loops](../../src/utils/engineering-math.ts#L129-L147). These figures drive the [minimum-workstation calculation](../../src/utils/engineering-math.ts#L192-L194), [VA ratio](../../src/utils/engineering-math.ts#L226-L228), and [whole-line work-content presentation](../../src/components/KPIRow.tsx#L164-L180).

**Fixture:** assigned VA task A of 10 seconds; unassigned NVA task B of 90 seconds; takt 10 seconds. Observed total work is 10 seconds, VA ratio 100%, and theoretical minimum 1.

**Expected:** project work content 100 seconds, project VA ratio 10%, and a whole-project labor lower bound of 10. Allocated work remains 10 seconds and may have its own explicitly named ratio. A valid complete-line output claim remains unavailable until the backlog is resolved. Moving tasks into backlog must not improve the apparent amount or mix of work required to make the product.

**Acceptance:** assignment changes affect allocation/completeness metrics without changing whole-project work content, category totals, or task-derived labor lower bounds.

### ENG-003 — Workforce count alone can create unsupported machine capacity

**Priority:** P1 model-contract defect. **Status:** reproduced; physical feasibility remains unmodeled.

The engine [divides all allocated durations by workforce](../../src/utils/engineering-math.ts#L129-L149), while the [model records no duration kind, indivisibility, parallel machine count, operator schedule, or resource occupation](../../src/types/flowlab.ts#L12-L33). The [workforce stepper](../../src/components/BalancingBoard.tsx#L175-L205) makes this an ordinary user action.

**Fixture:** one fixed 100-second machine operation and a 60-second takt. Changing one operator to two changes reported cycle from 100 to 50 seconds, hourly output from 36 to 72, and attainment from false to true. The recorded model adds no second machine or evidence that the operation is divisible.

The shipped EV example makes the assumption concrete: the [110-second enclosed laser welding cycle](../../src/utils/sample-projects.ts#L111-L121) belongs to a station with 221 seconds of allocated work. Three operators produce a reported station cycle of 73.667 seconds; five produce 44.2 seconds. Those results cannot establish feasible output for the described single laser cell. Extra operators do not by themselves shorten its fixed machine occupation.

**Expected:** state that `work / operators` is an optimistic labor bound, or support explicit resource and parallelism models before presenting it as attainable cycle time. Do not infer a machine-capacity increase from workforce alone. Multiple independent machines or fixtures may make faster throughput possible, but their availability and overlap must be recorded and validated.

**Acceptance:** adding an operator to a fixed single-machine fixture must not reduce the governing machine occupation. Parallel-resource fixtures may improve output only according to explicit supported assumptions. All UI and report consumers use the same interpretation.

### ENG-004 — A labor lower bound is labeled a minimum workstation count

**Priority:** P2. **Status:** source-confirmed and reproduced.

[`ceil(total work / takt)`](../../src/utils/engineering-math.ts#L192-L194) is compared to physical station count in the [“N vs N_min” KPI](../../src/components/KPIRow.tsx#L142-L160), although [stations may have multiple operators](../../src/types/flowlab.ts#L26-L32).

**Fixture:** 100 seconds of labor content and takt 60 seconds gives lower bound 2. In the ideal divisible-labor interpretation, a single two-operator station can satisfy that labor bound; the current display still presents one station versus a minimum of two.

**Expected:** identify this as a theoretical minimum labor resource under explicit assumptions. A physical workstation minimum needs a defined operator/resource-capacity model and relevant precedence/compatibility restrictions. Neither lower bound is proof that an allocation exists. Include all required work, as described in ENG-002.

### ENG-005 — OEE is recorded but output remains an undisclosed ideal estimate

**Priority:** P2. **Status:** source-confirmed and reproduced.

[`oeeTargetPercent`](../../src/types/flowlab.ts#L35-L42) is populated in sample operating parameters but unused by the engineering engine. Changing it from 50% to 100% leaves every calculated result unchanged. The [capacity KPI](../../src/components/KPIRow.tsx#L119-L138) and [report capacity](../../src/components/PrintReportView.tsx#L99-L103) do not explain whether output is nominal or effective good output.

**Expected:** explicitly define ideal capacity, measured/assumed availability, performance and quality losses, and effective good output. Keep customer takt independent of internal effectiveness. If task durations already include some losses, applying an aggregate OEE factor again may double count them. Until the convention is defined, label output as an ideal deterministic estimate and expose that the OEE target is informational.

## Golden cases and observed results

These cases distinguish validated arithmetic from incorrect or unsupported conclusions. “Expected” is the proposed engineering contract, not an implemented fix.

| Case | Inputs | Observed at baseline | Expected |
| --- | --- | --- | --- |
| Valid time/takt/target | 2 shifts/day, 8 hours/shift, 30 min downtime/shift, 450 units/1 day, 10% buffer | 54,000 seconds; takt 120 s; target 108 s | Same. Proven good. |
| Valid single-operator balance | Two stations, tasks 100 s and 80 s in valid sequence, preceding schedule | Work 180 s; bottleneck 100 s; efficiency 90%; loss 10%; smoothness 20 s; output 36/hour and 540/day; attained | Same under deterministic assumptions. Proven good. |
| Five-day horizon | 1 hour/day, CT10 s, demand 1,800/5 days | Daily time 18,000 s; daily output 1,800 | Daily time 3,600 s; daily output 360; period output 1,800. |
| Reverse station order | A5 s at S2; B5 s depends on A at S1; takt10 s | One precedence error; attained | Invalid; never attained/approved. |
| Same-station cycle | A5 s depends on B; B5 s depends on A; both at S1 | Zero precedence errors; attained; graph render throws RangeError | Invalid graph; diagnostic rather than recursion failure. |
| Cyclic report | Same cyclic model | “Certified” and “AUDIT CERTIFICATE”; no precedence warning | No approval claim; clear invalid-state report. |
| Missing predecessor | A5 s at S1, predecessor ID `MISSING` | Zero precedence errors; attained | Invalid unresolved reference. |
| Empty line | One station, no tasks, positive demand/time | Zero capacity; attained | Incomplete/empty, not attained. |
| Backlog | Assigned VA10 s plus unassigned NVA90 s; takt10 s | Work10 s; VA100%; minimum1 | Project work100 s; VA10%; labor lower bound10; incomplete allocation. |
| Fixed machine | One 100 s machine operation; takt60 s; one → two operators | CT100 → 50; capacity36 → 72/hour; not attained → attained | No claim that the machine cycle halved; require explicit resource semantics. |
| Labor versus station count | Work100 s; takt60 s; one two-operator station | Two “minimum workstations” | Two ideal labor resources; physical station minimum not established. |
| OEE contract | Identical plan at 50% versus 100% OEE target | Identical output | Ideal output may remain equal, but effective-good-output interpretation must be explicit. |

## Executable reproduction

Run from the repository root with the already-installed dependencies. This is a read-only diagnostic; it writes no project files. The first two cases use assertions for known-good arithmetic. The remaining output captures the current behavior and prints the expected contract alongside it; the incorrect observed results must not become desired regression assertions.

```bash
node --import tsx --input-type=module <<'AUDIT'
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  calculateAvailableTime, calculateTaktTime,
  calculateTargetCycleTime, calculateLineMetrics,
} from './src/utils/engineering-math.ts';
import { PrecedenceGraph } from './src/components/PrecedenceGraph.tsx';
import { PrintReportView } from './src/components/PrintReportView.tsx';

const station = (id, operatorCount = 1) => ({
  id, code: id, name: id, operatorCount,
});
const task = (id, duration, assignedStationId, predecessors = [], category = 'VA') => ({
  id, code: id, name: id, duration, assignedStationId,
  predecessors, category, ergonomics: 'low',
});
const params = {
  demandUnitsPerPeriod: 360, demandPeriodDays: 1,
  shiftsPerDay: 1, hoursPerShift: 1,
  plannedDowntimeMinutesPerShift: 0,
  oeeTargetPercent: 100, targetBufferPercent: 0,
};
const summary = m => ({
  takt: m.taktTimeSeconds,
  availableTimeNamedPerDay: m.availableTimeSecondsPerDay,
  bottleneck: m.bottleneckCycleTime,
  work: m.totalWorkContentSeconds,
  minNamedWorkstations: m.theoreticalMinWorkstations,
  hourly: m.hourlyProductionCapacity,
  capacityNamedPerDay: m.dailyProductionCapacity,
  attained: m.taktAttainmentAchieved,
  precedenceErrors: m.precedenceErrors.length,
  unassigned: m.unassignedTasks.length,
  vaPercent: m.vaRatioPercent,
});
const record = (name, observed, expected) => {
  console.log(JSON.stringify({ name, observed, expected }, null, 2));
};

const goodParams = {
  ...params, demandUnitsPerPeriod: 450, shiftsPerDay: 2,
  hoursPerShift: 8, plannedDowntimeMinutesPerShift: 30,
  targetBufferPercent: 10,
};
assert.equal(calculateAvailableTime(goodParams), 54000);
assert.equal(calculateTaktTime(goodParams), 120);
assert.equal(calculateTargetCycleTime(goodParams, 120), 108);
const good = calculateLineMetrics(
  [station('S1'), station('S2')],
  [task('A', 100, 'S1'), task('B', 80, 'S2', ['A'])], goodParams,
);
assert.equal(good.totalWorkContentSeconds, 180);
assert.equal(good.bottleneckCycleTime, 100);
assert.equal(good.lineBalancingEfficiencyPercent, 90);
assert.equal(good.balancingLossPercent, 10);
assert.equal(good.smoothnessIndex, 20);
assert.equal(good.hourlyProductionCapacity, 36);
assert.equal(good.dailyProductionCapacity, 540);
assert.equal(good.taktAttainmentAchieved, true);
console.log('Known-good arithmetic: PASS');

const s1 = [station('S1')];
record('ENG-001 five-day period', summary(calculateLineMetrics(
  s1, [task('A', 10, 'S1')],
  { ...params, demandPeriodDays: 5, demandUnitsPerPeriod: 1800 },
)), { dailyTime: 3600, dailyCapacity: 360, periodCapacity: 1800 });

record('P0-002 reverse routing', summary(calculateLineMetrics(
  [station('S1'), station('S2')],
  [task('A', 5, 'S2'), task('B', 5, 'S1', ['A'])], params,
)), { valid: false, attained: false });

const cyclic = [task('A', 5, 'S1', ['B']), task('B', 5, 'S1', ['A'])];
const cyclicMetrics = calculateLineMetrics(s1, cyclic, params);
record('P0-002 cyclic routing', summary(cyclicMetrics), {
  valid: false, attained: false, graphDiagnostic: 'cycle',
});
let graphResult;
try {
  renderToStaticMarkup(React.createElement(PrecedenceGraph, {
    tasks: cyclic, stations: s1, onSelectTask: () => {},
  }));
  graphResult = 'rendered';
} catch (error) {
  graphResult = `${error.name}: ${error.message}`;
}
record('Cycle graph rendering', graphResult, 'Visible invalid-graph diagnostic');

const project = {
  id: 'audit', name: 'Cyclic fixture', partNumber: '', plantLocation: '',
  lastModified: '2026-10-17T00:00:00Z', operatingParams: params,
  stations: s1, tasks: cyclic, scenarios: [],
};
const report = renderToStaticMarkup(React.createElement(PrintReportView, {
  project, metrics: cyclicMetrics, onBack: () => {},
}));
record('P0-002 automatic certification', {
  certified: report.includes('Certified'),
  auditCertificate: report.includes('LINE BALANCING AUDIT CERTIFICATE'),
  precedenceWarning: report.toLowerCase().includes('precedence'),
}, { approvalClaim: false, visibleInvalidity: true });

record('Missing predecessor', summary(calculateLineMetrics(
  s1, [task('A', 5, 'S1', ['MISSING'])], params,
)), { valid: false, attained: false });
record('Empty line', summary(calculateLineMetrics(s1, [], params)), {
  attained: false, status: 'empty/incomplete',
});
record('ENG-002 backlog', summary(calculateLineMetrics(
  s1, [task('A', 10, 'S1'), task('B', 90, null, [], 'NVA')], params,
)), { projectWork: 100, projectVaPercent: 10, laborLowerBound: 10 });

const machineParams = { ...params, demandUnitsPerPeriod: 60 };
for (const operators of [1, 2]) {
  record(`ENG-003 fixed machine with ${operators} operators`,
    summary(calculateLineMetrics(
      [station('S1', operators)], [task('MACHINE', 100, 'S1')], machineParams,
    )), 'Do not shorten fixed machine occupation from workforce alone');
}
for (const oeeTargetPercent of [50, 100]) {
  record(`ENG-005 OEE target ${oeeTargetPercent}`, summary(calculateLineMetrics(
    s1, [task('A', 10, 'S1')], { ...params, oeeTargetPercent },
  )), 'Explicitly distinguish ideal output from effective good output');
}
AUDIT
```

## Recommended first implementation phase

1. Introduce a validated project/graph boundary and typed assessment states. Reject nonfinite or invalid numeric inputs, duplicate identifiers, unresolved references, cycles, invalid assignments, and unsupported model configurations before presenting feasibility. Preserve an explicit incomplete state for backlog and empty lines.
2. Close P0-002 across the engine, scenarios, report, and graph. A single assessment must govern status everywhere; calculations do not confer engineering approval. Failures should produce actionable diagnostics without crashing the application.
3. Separate day/period quantities and project/allocated work. Update result types and all consumers together. Make scenario comparisons disclose or normalize their horizons.
4. Constrain the initial supported capacity model. Record or clearly disclose assumptions for manual work, machine occupation, resources, parallelism, and workforce. Until resource feasibility is represented, expose ideal estimates as bounds and avoid production-approval language.
5. Turn the golden cases above into meaningful regression tests with corrected expected outcomes, including UI/report status integration. Define OEE and physical-station semantics before adding new derived outputs.

The phase is complete when a valid baseline still reproduces the known-good arithmetic, every invalid fixture is consistently rejected or marked incomplete, no report can automatically certify it, and time/work/resource units remain consistent from the calculation engine through export and display.

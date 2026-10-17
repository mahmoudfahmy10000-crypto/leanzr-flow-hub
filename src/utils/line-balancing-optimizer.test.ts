import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePositionalWeights,
  runRPWOptimization,
  runLPTOptimization,
} from './line-balancing-optimizer.ts';
import type { Task } from '../types/flowlab.ts';

const sampleTasks: Task[] = [
  { id: '1', code: 'T1', name: 'Task 1', duration: 40, category: 'VA', predecessors: [], assignedStationId: null, ergonomics: 'low' },
  { id: '2', code: 'T2', name: 'Task 2', duration: 30, category: 'VA', predecessors: ['1'], assignedStationId: null, ergonomics: 'low' },
  { id: '3', code: 'T3', name: 'Task 3', duration: 50, category: 'VA', predecessors: ['1'], assignedStationId: null, ergonomics: 'low' },
  { id: '4', code: 'T4', name: 'Task 4', duration: 20, category: 'VA', predecessors: ['2', '3'], assignedStationId: null, ergonomics: 'low' },
];

test('calculatePositionalWeights sums duration plus all successor durations', () => {
  const weights = calculatePositionalWeights(sampleTasks);
  // T4 has no successors: weight = 20
  // T2 has successor T4: weight = 30 + 20 = 50
  // T3 has successor T4: weight = 50 + 20 = 70
  // T1 has successors T2, T3, T4: weight = 40 + 30 + 50 + 20 = 140
  assert.equal(weights.get('4'), 20);
  assert.equal(weights.get('2'), 50);
  assert.equal(weights.get('3'), 70);
  assert.equal(weights.get('1'), 140);
});

test('runRPWOptimization packs stations under target cycle time and assigns all tasks', () => {
  // Target cycle time = 80s
  // Total work = 140s
  // Min stations = ceil(140 / 80) = 2 stations
  const result = runRPWOptimization(sampleTasks, 80);

  assert.equal(result.unassignedTasksCount, 0);
  assert.ok(result.stationsCount >= 2);
  assert.ok(result.maxCycleTime <= 80);

  // Check precedence satisfaction: T1 must be at station <= T2, T3, T4
  const t1 = result.tasks.find(t => t.id === '1')!;
  const t4 = result.tasks.find(t => t.id === '4')!;
  assert.ok(t1.assignedStationId);
  assert.ok(t4.assignedStationId);
});

test('runLPTOptimization produces feasible deterministic balance', () => {
  const result = runLPTOptimization(sampleTasks, 80);
  assert.equal(result.unassignedTasksCount, 0);
  assert.ok(result.maxCycleTime <= 80);
});

import { runSmoothnessLeveling } from './line-balancing-optimizer.ts';
import { calculateLineMetrics } from './engineering-math.ts';
import { validateLineModel } from './project-validation.ts';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { OptimizerModal } from '../components/OptimizerModal.tsx';
import type { OperatingParameters, Workstation } from '../types/flowlab.ts';

const task = (id: string, duration: number, assignedStationId: string | null = null, predecessors: string[] = []): Task => ({
  id, code: id, name: id, duration, assignedStationId, predecessors, category: 'VA', ergonomics: 'low',
});
const station = (id: string, operatorCount = 1): Workstation => ({ id, code: id, name: id, operatorCount });
const params: OperatingParameters = {
  demandUnitsPerPeriod: 36, demandPeriodDays: 1, shiftsPerDay: 1, hoursPerShift: 1,
  plannedDowntimeMinutesPerShift: 0, oeeTargetPercent: 100, targetBufferPercent: 0,
};

function assertCanonicalMetrics(result: ReturnType<typeof runRPWOptimization>) {
  const metrics = calculateLineMetrics(result.stations, result.tasks, params);
  assert.equal(result.maxCycleTime, metrics.bottleneckCycleTime);
  assert.equal(result.efficiencyPercent, metrics.lineBalancingEfficiencyPercent);
  assert.equal(result.smoothnessIndex, metrics.smoothnessIndex);
  assert.equal(result.stationsCount, metrics.actualWorkstationsCount);
}

for (const optimize of [runRPWOptimization, runLPTOptimization]) {
  test(`${optimize.name}: cycles and dangling references are explicit invalid proposals`, () => {
    for (const tasks of [
      [task('A', 10, 's1', ['B']), task('B', 10, 's1', ['A'])],
      [task('A', 10, null, ['MISSING'])],
    ]) {
      const before = structuredClone(tasks);
      const result = optimize(tasks, 60, [station('s1')]);
      assert.equal(result.assessment.status, 'invalid');
      assert.ok(result.assessment.reasons.some((reason) => reason.code.startsWith('graph.')));
      assert.deepEqual(result.tasks, before);
      assert.deepEqual(tasks, before);
      assert.doesNotMatch(result.summary, /balanced|approved/i);
    }
  });

  test(`${optimize.name}: duplicate identities and nonfinite durations cannot silently lose tasks`, () => {
    for (const tasks of [[task('A', 10), task('A', 20)], [task('A', Infinity)], [task('A', NaN)]]) {
      const result = optimize(tasks, 60);
      assert.equal(result.assessment.status, 'invalid');
      assert.equal(result.tasks.length, tasks.length);
      assert.ok(result.assessment.reasons.length > 0);
    }
  });

  test(`${optimize.name}: invalid target numbers are rejected without changing the allocation`, () => {
    for (const target of [NaN, Infinity, -1, 0, 1e-320]) {
      const tasks = [task('A', 20, 's1')];
      const result = optimize(tasks, target, [station('s1')]);
      assert.equal(result.assessment.status, 'invalid');
      assert.ok(result.assessment.reasons.some((reason) => reason.code === 'optimizer_target'));
      assert.deepEqual(result.tasks, tasks);
    }
  });

  test(`${optimize.name}: generated IDs and codes cannot collide with retained identities`, () => {
    const existing = [{ ...station('station-2'), code: 'st-02' }];
    const tasks = [task('A', 50), task('B', 50), task('C', 50)];
    const result = optimize(tasks, 50, existing);
    assert.equal(result.assessment.status, 'valid');
    assert.equal(result.stations.length, 3);
    assert.equal(new Set(result.stations.map((item) => item.id)).size, 3);
    assert.equal(new Set(result.stations.map((item) => item.code.toLowerCase())).size, 3);
    assert.equal(validateLineModel(result.stations, result.tasks).length, 0);
    assert.equal(result.tasks.reduce((sum, item) => sum + item.duration, 0), 150);
    assert.equal(calculateLineMetrics(result.stations, result.tasks, params).allocatedWorkContentSeconds, 150);
    assertCanonicalMetrics(result);
    assert.deepEqual(result, optimize(tasks, 50, existing));
  });

  test(`${optimize.name}: oversized indivisible work is infeasible, never claimed balanced`, () => {
    const result = optimize([task('MACHINE', 120)], 60);
    assert.equal(result.maxCycleTime, 120);
    assert.equal(result.unassignedTasksCount, 0);
    assert.equal(result.assessment.status, 'infeasible');
    assert.ok(result.assessment.reasons.some((reason) => reason.code === 'optimizer_target_exceeded'));
    assert.doesNotMatch(result.summary, /balanced|approved/i);
  });

  test(`${optimize.name}: exact decimal targets are not changed by synthetic evaluator rounding`, () => {
    const result = optimize([task('A', 0.21)], 0.21);
    assert.equal(result.maxCycleTime, 0.21);
    assert.equal(result.assessment.status, 'valid');
  });

  test(`${optimize.name}: operator count cannot accelerate machine-bound work and uses canonical metrics`, () => {
    const tasks = [task('MACHINE', 100)];
    const single = optimize(tasks, 100, [station('s1')]);
    const multiple = optimize(tasks, 100, [station('s1', 2)]);
    assert.equal(single.maxCycleTime, 100);
    assert.equal(multiple.maxCycleTime, 100);
    assert.equal(multiple.assessment.status, 'unsupported');
    assert.ok(multiple.assessment.reasons.some((reason) => reason.code === 'MULTI_OPERATOR'));
    assertCanonicalMetrics(multiple);
  });
}

test('positional weighting rejects cycles without recursion', () => {
  assert.equal(calculatePositionalWeights([task('A', 10, null, ['B']), task('B', 20, null, ['A'])]).size, 0);
});

test('leveling returns its actual improved allocation and preserves all task metadata without input mutation', () => {
  const stations = [station('s1'), station('s2')];
  const tasks = [
    { ...task('A', 40, 's1'), description: 'Machine cycle', requiredSkills: ['welding'], toolsAndFixtures: ['fixture-1'] },
    task('B', 20, 's1'), task('C', 10, 's2'),
  ];
  const beforeTasks = structuredClone(tasks);
  const beforeStations = structuredClone(stations);
  const result = runSmoothnessLeveling(stations, tasks, 100);
  assert.equal(result.assessment.status, 'valid');
  assert.equal(result.maxCycleTime, 40);
  assert.equal(result.smoothnessIndex, 10);
  assert.equal(result.efficiencyPercent, 87.5);
  assert.notDeepEqual(result.tasks.map((item) => item.assignedStationId), tasks.map((item) => item.assignedStationId));
  for (const original of tasks) {
    const updated = result.tasks.find((item) => item.id === original.id)!;
    assert.deepEqual({ ...updated, assignedStationId: original.assignedStationId }, original);
  }
  assert.deepEqual(tasks, beforeTasks);
  assert.deepEqual(stations, beforeStations);
  assertCanonicalMetrics(result);
});

test('leveling checks current assignments on every move and respects precedence', () => {
  const result = runSmoothnessLeveling([station('s1'), station('s2')], [
    task('A', 40, 's1'), task('B', 20, 's1', ['A']), task('C', 10, 's2', ['B']),
  ], 100);
  assert.equal(result.assessment.status, 'valid');
  assert.equal(result.maxCycleTime, 40);
  assert.equal(calculateLineMetrics(result.stations, result.tasks, params).precedenceErrors.length, 0);
  assertCanonicalMetrics(result);
});

test('leveling handles empty, cyclic, unsupported and invalid target inputs explicitly', () => {
  assert.equal(runSmoothnessLeveling([], [], 60).assessment.status, 'incomplete');
  assert.equal(runSmoothnessLeveling([station('s1')], [task('A', 10, 's1', ['A'])], 60).assessment.status, 'invalid');
  assert.equal(runSmoothnessLeveling([station('s1')], [task('A', 10, 's1')], NaN).assessment.status, 'invalid');
  const multiple = runSmoothnessLeveling([station('s1', 2)], [task('A', 100, 's1')], 100);
  assert.equal(multiple.maxCycleTime, 100);
  assert.equal(multiple.assessment.status, 'unsupported');
  assertCanonicalMetrics(multiple);
});

test('closed optimizer does no work on cyclic tasks and leaves the dashboard renderable', () => {
  const stations = [station('s1')];
  const tasks = [task('A', 10, 's1', ['B']), task('B', 10, 's1', ['A'])];
  const markup = renderToString(createElement(OptimizerModal, {
    isOpen: false, onClose() {}, stations, tasks, params,
    currentMetrics: calculateLineMetrics(stations, tasks, params),
    onApplyOptimization() {}, onSaveAsScenario() {},
  }));
  assert.equal(markup, '');
});

test('optimizer disables apply and scenario save for infeasible or unsupported proposals', () => {
  for (const [stations, tasks] of [
    [[station('s1')], [task('A', 120, 's1')]],
    [[station('s1', 2)], [task('A', 20, 's1')]],
  ] as [Workstation[], Task[]][]) {
    const markup = renderToString(createElement(OptimizerModal, {
      isOpen: true, onClose() {}, stations, tasks, params,
      currentMetrics: calculateLineMetrics(stations, tasks, params),
      onApplyOptimization() {}, onSaveAsScenario() {},
    }));
    assert.equal((markup.match(/disabled=""/g) ?? []).length, 2);
    assert.match(markup, /Resolve the listed issues/);
  }
});

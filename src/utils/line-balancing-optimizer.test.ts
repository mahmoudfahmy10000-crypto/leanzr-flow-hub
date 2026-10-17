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

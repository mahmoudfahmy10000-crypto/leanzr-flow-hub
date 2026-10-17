import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAvailableTime,
  calculateTaktTime,
  calculateTargetCycleTime,
  calculateLineMetrics,
  validatePrecedence,
} from './engineering-math.ts';
import type { OperatingParameters, Task, Workstation } from '../types/flowlab.ts';

const mockParams: OperatingParameters = {
  demandUnitsPerPeriod: 450,
  demandPeriodDays: 1,
  shiftsPerDay: 2,
  hoursPerShift: 8,
  plannedDowntimeMinutesPerShift: 30, // 450 net minutes per shift = 27,000s * 2 = 54,000s
  oeeTargetPercent: 85,
  targetBufferPercent: 10,
};

test('calculateAvailableTime calculates net operating seconds accurately', () => {
  // (8 * 60 - 30) = 450 min/shift * 60 = 27,000s * 2 shifts = 54,000 seconds
  const available = calculateAvailableTime(mockParams);
  assert.equal(available, 54000);
});

test('calculateTaktTime yields correct seconds per unit', () => {
  // 54,000s / 450 units = 120 seconds per unit
  const takt = calculateTaktTime(mockParams);
  assert.equal(takt, 120);
});

test('calculateTargetCycleTime applies buffer discount correctly', () => {
  // 120 * (1 - 0.10) = 108 seconds
  const target = calculateTargetCycleTime(mockParams, 120);
  assert.equal(target, 108);
});

test('validatePrecedence identifies sequence violations', () => {
  const stations: Workstation[] = [
    { id: 's1', code: 'ST-01', name: 'Station 1', operatorCount: 1 },
    { id: 's2', code: 'ST-02', name: 'Station 2', operatorCount: 1 },
  ];

  const tasks: Task[] = [
    {
      id: 't1',
      code: 'OP-01',
      name: 'Base frame setup',
      duration: 50,
      category: 'VA',
      predecessors: [],
      assignedStationId: 's2', // assigned to station 2
      ergonomics: 'low',
    },
    {
      id: 't2',
      code: 'OP-02',
      name: 'Mount bracket (depends on OP-01)',
      duration: 40,
      category: 'VA',
      predecessors: ['t1'],
      assignedStationId: 's1', // assigned to station 1: VIOLATION!
      ergonomics: 'low',
    },
  ];

  const errors = validatePrecedence(tasks, stations);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Sequence violation/);
});

test('calculateLineMetrics computes efficiency, bottleneck, and smoothness index correctly', () => {
  const stations: Workstation[] = [
    { id: 's1', code: 'ST-01', name: 'Station 1', operatorCount: 1 },
    { id: 's2', code: 'ST-02', name: 'Station 2', operatorCount: 1 },
  ];

  const tasks: Task[] = [
    {
      id: 't1',
      code: 'OP-01',
      name: 'Task 1',
      duration: 100,
      category: 'VA',
      predecessors: [],
      assignedStationId: 's1',
      ergonomics: 'low',
    },
    {
      id: 't2',
      code: 'OP-02',
      name: 'Task 2',
      duration: 80,
      category: 'VA',
      predecessors: ['t1'],
      assignedStationId: 's2',
      ergonomics: 'low',
    },
  ];

  const metrics = calculateLineMetrics(stations, tasks, mockParams);

  // Total work = 180s. Bottleneck = ST-01 at 100s.
  // Efficiency = 180 / (2 * 100) = 90%
  assert.equal(metrics.totalWorkContentSeconds, 180);
  assert.equal(metrics.bottleneckCycleTime, 100);
  assert.equal(metrics.bottleneckStationId, 's1');
  assert.equal(metrics.lineBalancingEfficiencyPercent, 90);
  assert.equal(metrics.balancingLossPercent, 10);
  // Smoothness index: sqrt((100-100)^2 + (100-80)^2) = sqrt(400) = 20
  assert.equal(metrics.smoothnessIndex, 20);
  // Takt is 120s, bottleneck is 100s <= 120s, no unassigned tasks
  assert.equal(metrics.taktAttainmentAchieved, true);
});

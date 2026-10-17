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

// Phase 1: golden engineering contracts independent of sample UI data.
const oneHour = {...mockParams, demandUnitsPerPeriod:360, demandPeriodDays:1,
  shiftsPerDay:1, hoursPerShift:1, plannedDowntimeMinutesPerShift:0, targetBufferPercent:0};
const station = (id = 's1', operatorCount = 1): Workstation => ({id, code:id, name:id, operatorCount});
const operation = (id: string, duration: number, assignedStationId: string | null = 's1', predecessors: string[] = [], category: Task['category'] = 'VA'): Task =>
  ({id, code:id, name:id, duration, assignedStationId, predecessors, category, ergonomics:'low'});

test('daily and period output have independent horizons while proportional demand preserves takt', () => {
  const daily = calculateLineMetrics([station()], [operation('A',10)], oneHour);
  const weekly = calculateLineMetrics([station()], [operation('A',10)], {...oneHour,demandPeriodDays:5,demandUnitsPerPeriod:1800});
  assert.equal(weekly.availableTimeSecondsPerDay,3600);
  assert.equal(weekly.availableTimeSecondsPerPeriod,18000);
  assert.equal(weekly.dailyProductionCapacity,360);
  assert.equal(weekly.periodProductionCapacity,1800);
  assert.equal(weekly.taktTimeSeconds,daily.taktTimeSeconds);
  assert.equal(weekly.assessment.status,'valid');
});

test('project work and VA ratio remain invariant when allocation changes', () => {
  const tasks = [operation('A',10), operation('B',90,null,[],'NVA')];
  const result = calculateLineMetrics([station()],tasks,oneHour);
  assert.equal(result.totalWorkContentSeconds,100);
  assert.equal(result.allocatedWorkContentSeconds,10);
  assert.equal(result.vaRatioPercent,10);
  assert.equal(result.allocatedVaRatioPercent,100);
  assert.equal(result.theoreticalMinOperators,10);
  assert.equal(result.assessment.status,'incomplete');
  assert.equal(result.taktAttainmentAchieved,false);
  const reassigned = calculateLineMetrics([station()],tasks.map(task=>({...task,assignedStationId:'s1'})),oneHour);
  assert.equal(reassigned.totalWorkContentSeconds,100);
  assert.equal(reassigned.vaRatioPercent,10);
});

test('backward precedence cannot attain takt even when every load fits', () => {
  const metrics = calculateLineMetrics([station('s1'),station('s2')], [operation('A',5,'s2'),operation('B',5,'s1',['A'])], oneHour);
  assert.equal(metrics.assessment.status,'infeasible');
  assert.ok(metrics.assessment.reasons.some(reason=>reason.code==='PRECEDENCE_ORDER'));
  assert.equal(metrics.taktAttainmentAchieved,false);
});

test('cycles, dangling references, and duplicated identities return invalid finite results', () => {
  const candidates = [
    [operation('A',5,'s1',['B']),operation('B',5,'s1',['A'])],
    [operation('A',5,'s1',['MISSING'])],
    [operation('A',5),operation('A',10)],
  ];
  for (const tasks of candidates) {
    const result = calculateLineMetrics([station()],tasks,oneHour);
    assert.equal(result.assessment.status,'invalid');
    assert.equal(result.taktAttainmentAchieved,false);
    assert.ok(result.assessment.reasons.length>0);
    assert.ok(Object.values(result).filter(value=>typeof value==='number').every(Number.isFinite));
    assert.ok(validatePrecedence(tasks,[station()]).length>0);
  }
});

test('empty lines and missing assignment are incomplete with no success', () => {
  for (const [stations,tasks] of [[[],[]],[[station()],[]],[[station()],[operation('A',5,null)]]] as [Workstation[],Task[]][]) {
    const result = calculateLineMetrics(stations,tasks,oneHour);
    assert.equal(result.assessment.status,'incomplete');
    assert.equal(result.taktAttainmentAchieved,false);
  }
});

test('adding operators never accelerates a fixed machine operation and marks unsupported', () => {
  const params = {...oneHour,demandUnitsPerPeriod:60};
  const single = calculateLineMetrics([station()], [operation('machine',100)],params);
  const multi = calculateLineMetrics([station('s1',2)], [operation('machine',100)],params);
  assert.equal(single.bottleneckCycleTime,100);
  assert.equal(multi.bottleneckCycleTime,100);
  assert.equal(multi.hourlyProductionCapacity,single.hourlyProductionCapacity);
  assert.equal(multi.assessment.status,'unsupported');
  assert.equal(multi.taktAttainmentAchieved,false);
  assert.ok(multi.assessment.reasons.some(reason=>reason.code==='OVER_TAKT'));
});

test('over-takt and workplace-capacity violations have actionable infeasibility reasons', () => {
  const result = calculateLineMetrics([{...station(),maxWorkplaceCapacity:0.5}], [operation('A',20)],oneHour);
  // A malformed capacity is a runtime validation error, never a repaired input.
  assert.equal(result.assessment.status,'invalid');
  const over = calculateLineMetrics([station()], [operation('A',20)],oneHour);
  assert.equal(over.assessment.status,'infeasible');
  assert.equal(over.taktAttainmentAchieved,false);
  assert.ok(over.assessment.reasons.some(reason=>reason.code==='OVER_TAKT'));
});

test('nonfinite inputs, invalid schedules, and derived overflow cannot produce success or Infinity', () => {
  const cases: [Workstation[],Task[],OperatingParameters][] = [
    [[station()],[operation('A',Infinity)],oneHour],
    [[station()],[operation('A',10)],{...oneHour,hoursPerShift:NaN}],
    [[station()],[operation('A',10)],{...oneHour,plannedDowntimeMinutesPerShift:60}],
    [[station()],[operation('A',1e308),operation('B',1e308)],oneHour],
    [[station()],[operation('A',1)],{...oneHour,demandPeriodDays:1e308}],
    [[station()],[operation('A',1e300)],{...oneHour,demandUnitsPerPeriod:1e300}],
  ];
  for (const [stations,tasks,params] of cases) {
    const result = calculateLineMetrics(stations,tasks,params);
    assert.equal(result.assessment.status,'invalid');
    assert.equal(result.taktAttainmentAchieved,false);
    assert.ok(Object.values(result).filter(value=>typeof value==='number').every(Number.isFinite));
  }
});

test('OEE remains informational and the nominal capacity assumption is explicit', () => {
  const low = calculateLineMetrics([station()],[operation('A',10)],{...oneHour,oeeTargetPercent:50});
  const high = calculateLineMetrics([station()],[operation('A',10)],{...oneHour,oeeTargetPercent:100});
  assert.equal(low.taktTimeSeconds,high.taktTimeSeconds);
  assert.equal(low.dailyProductionCapacity,high.dailyProductionCapacity);
  assert.ok(low.assessment.assumptions.some(text=>text.includes('OEE target is informational')));
  assert.ok(low.assessment.assumptions.some(text=>text.includes('not engineering approval')));
});

test('valid fractional durations and target buffer use the same unclamped contract', () => {
  const result = calculateLineMetrics([station()],[operation('A',0.25)],{...oneHour,targetBufferPercent:60});
  assert.equal(result.assessment.status,'valid');
  assert.equal(result.targetCycleTimeSeconds,4);
});

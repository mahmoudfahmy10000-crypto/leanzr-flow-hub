/** Deterministic precedence-aware heuristics under the shared sequential-station model. */
import type { Task, Workstation, LineCalculations, OperatingParameters } from '../types/flowlab.ts';
import { calculateLineMetrics } from './engineering-math.ts';
import { topologicalTaskOrder, validateLineModel } from './project-validation.ts';

export interface OptimizationResult {
  algorithm: 'rpw' | 'lpt' | 'leveling';
  stations: Workstation[];
  tasks: Task[];
  stationsCount: number;
  maxCycleTime: number;
  efficiencyPercent: number;
  smoothnessIndex: number;
  unassignedTasksCount: number;
  assessment: LineCalculations['assessment'];
  summary: string;
}

type Algorithm = OptimizationResult['algorithm'];

/** Iterative DAG traversal: a cyclic or malformed graph has no positional weights. */
export function calculatePositionalWeights(tasks: Task[]): Map<string, number> {
  const { order, issues } = topologicalTaskOrder(tasks);
  if (issues.length || tasks.some((task) => !Number.isFinite(task.duration) || task.duration <= 0)) {
    return new Map();
  }
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const successors = new Map(tasks.map((task) => [task.id, new Set<string>()]));
  for (const task of tasks) {
    for (const predecessor of task.predecessors) successors.get(predecessor)!.add(task.id);
  }
  const weights = new Map<string, number>();
  // A successor appears after its predecessors in the topological order.
  for (const task of [...order].reverse()) {
    const id = task.id;
    const descendants = successors.get(id)!;
    for (const successor of [...descendants]) {
      for (const descendant of successors.get(successor)!) descendants.add(descendant);
    }
    weights.set(id, taskMap.get(id)!.duration + [...descendants].reduce((sum, child) => sum + taskMap.get(child)!.duration, 0));
  }
  return weights;
}

function targetIssue(target: number): LineCalculations['assessment']['reasons'][number] | undefined {
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(3600 / target)) {
    return { code: 'optimizer_target', status: 'invalid', message: 'Enter a finite, positive target cycle time within the supported numeric range.' };
  }
}

/** Only the time budget is synthetic; metrics and model validity come from the shared evaluator. */
function targetParameters(target: number): OperatingParameters {
  return {
    demandUnitsPerPeriod: targetIssue(target) ? 1 : 3600 / target,
    demandPeriodDays: 1,
    shiftsPerDay: 1,
    hoursPerShift: 1,
    plannedDowntimeMinutesPerShift: 0,
    oeeTargetPercent: 100,
    targetBufferPercent: 0,
  };
}

function finishResult(
  algorithm: Algorithm,
  stations: Workstation[],
  tasks: Task[],
  target: number,
  extraReasons: LineCalculations['assessment']['reasons'] = [],
  detail = ''
): OptimizationResult {
  const metrics = calculateLineMetrics(stations, tasks, targetParameters(target));
  // Replace only the synthetic customer-takt comparison with the original target.
  // A reciprocal round trip can move decimal boundaries by an ulp; validity,
  // routing, completeness and resource reasons still come from the evaluator.
  const reasons = [...metrics.assessment.reasons.filter((reason) => reason.code !== 'OVER_TAKT'), ...extraReasons];
  const invalidTarget = targetIssue(target);
  if (invalidTarget) reasons.push(invalidTarget);
  if (!invalidTarget && metrics.bottleneckCycleTime > target) {
    reasons.push({ code: 'optimizer_target_exceeded', status: 'infeasible', message: `Returned station load ${metrics.bottleneckCycleTime.toFixed(1)}s exceeds the ${target.toFixed(1)}s target. Increase the target or revise the allocation; indivisible tasks cannot be accelerated by adding operators.` });
  }
  const uniqueReasons = reasons.filter((reason, index) => reasons.findIndex((other) => other.code === reason.code && other.message === reason.message) === index);
  const status = (['invalid', 'incomplete', 'unsupported', 'infeasible'] as const).find((state) => uniqueReasons.some((reason) => reason.status === state)) ?? 'valid';
  const assessment: LineCalculations['assessment'] = { ...metrics.assessment, status, reasons: uniqueReasons };
  const stationIds = new Set(stations.map((station) => station.id));
  const unassignedTasksCount = tasks.filter((task) => !task.assignedStationId || !stationIds.has(task.assignedStationId)).length;
  const summary = `${algorithm.toUpperCase()} proposal: ${status}. ${tasks.length - unassignedTasksCount}/${tasks.length} tasks allocated across ${stations.length} stations; bottleneck ${metrics.bottleneckCycleTime.toFixed(1)}s, efficiency ${metrics.lineBalancingEfficiencyPercent.toFixed(1)}%.${detail ? ` ${detail}` : ''}`;
  return {
    algorithm,
    stations,
    tasks,
    stationsCount: stations.length,
    maxCycleTime: metrics.bottleneckCycleTime,
    efficiencyPercent: metrics.lineBalancingEfficiencyPercent,
    smoothnessIndex: metrics.smoothnessIndex,
    unassignedTasksCount,
    assessment,
    summary,
  };
}

/** Reserve identities from the entire original station list, including stations not reused. */
function createStations(count: number, existing: Workstation[]): Workstation[] {
  const usedIds = new Set(existing.map((station) => station.id));
  const usedCodes = new Set(existing.map((station) => station.code.trim().toLocaleLowerCase('en-US')));
  let nextId = 1;
  let nextCode = 1;
  return Array.from({ length: count }, (_, index) => {
    if (existing[index]) return { ...existing[index] };
    while (usedIds.has(`station-${nextId}`)) nextId++;
    while (usedCodes.has(`st-${String(nextCode).padStart(2, '0')}`)) nextCode++;
    const id = `station-${nextId++}`;
    const code = `ST-${String(nextCode++).padStart(2, '0')}`;
    usedIds.add(id);
    usedCodes.add(code.toLocaleLowerCase('en-US'));
    return { id, code, name: `Station ${index + 1}`, operatorCount: 1 };
  });
}

function runPacking(tasks: Task[], target: number, existingStations: Workstation[], algorithm: 'rpw' | 'lpt'): OptimizationResult {
  // Packing rebuilds assignments, but never repairs malformed identities, fields, or graphs.
  const issues = validateLineModel(existingStations, tasks.map((task) => ({ ...task, assignedStationId: null })));
  if (issues.length || targetIssue(target)) {
    return finishResult(algorithm, existingStations.map((station) => ({ ...station })), tasks.map((task) => ({ ...task })), target,
      issues.map((issue) => ({ code: issue.code, message: issue.message, status: 'invalid' as const })));
  }
  const weights = algorithm === 'rpw' ? calculatePositionalWeights(tasks) : new Map<string, number>();
  const sortedTasks = [...tasks].sort((a, b) =>
    (algorithm === 'rpw' ? (weights.get(b.id)! - weights.get(a.id)!) : 0) || b.duration - a.duration || a.id.localeCompare(b.id));
  const assigned = new Map<string, number>();
  const loads: number[] = [];
  let stationIndex = 0;
  while (assigned.size < tasks.length) {
    const eligible = sortedTasks.filter((task) => !assigned.has(task.id) && task.predecessors.every((id) => assigned.has(id)));
    if (!eligible.length) break; // Defensive: the shared DAG validator should already exclude this case.
    const load = loads[stationIndex] ?? 0;
    const candidate = eligible.find((task) => load + task.duration <= target);
    if (!candidate && load > 0) {
      stationIndex++;
      continue;
    }
    // Keep oversize work visible as an explicitly infeasible proposal, never as balanced/approved.
    const task = candidate ?? eligible[0];
    loads[stationIndex] = load + task.duration;
    assigned.set(task.id, stationIndex);
  }
  const stations = createStations(loads.length, existingStations);
  const updatedTasks = tasks.map((task) => ({ ...task, assignedStationId: assigned.has(task.id) ? stations[assigned.get(task.id)!].id : null }));
  return finishResult(algorithm, stations, updatedTasks, target);
}

export function runRPWOptimization(tasks: Task[], targetCycleTime: number, existingStations: Workstation[] = []): OptimizationResult {
  return runPacking(tasks, targetCycleTime, existingStations, 'rpw');
}

export function runLPTOptimization(tasks: Task[], targetCycleTime: number, existingStations: Workstation[] = []): OptimizationResult {
  return runPacking(tasks, targetCycleTime, existingStations, 'lpt');
}

/** Adjacent task moves minimize squared station load using one authoritative, current assignment map. */
export function runSmoothnessLeveling(stations: Workstation[], tasks: Task[], maxAllowedCycleTime: number): OptimizationResult {
  const clonedStations = stations.map((station) => ({ ...station }));
  const clonedTasks = tasks.map((task) => ({ ...task }));
  const initial = finishResult('leveling', clonedStations, clonedTasks, maxAllowedCycleTime);
  if (initial.assessment.status === 'invalid' || initial.assessment.status === 'incomplete' || targetIssue(maxAllowedCycleTime)) return initial;
  const stationIndex = new Map(stations.map((station, index) => [station.id, index]));
  const assignment = new Map(clonedTasks.map((task) => [task.id, stationIndex.get(task.assignedStationId!)!]));
  const successors = new Map(tasks.map((task) => [task.id, [] as string[]]));
  for (const task of tasks) for (const predecessor of task.predecessors) successors.get(predecessor)!.push(task.id);
  const loads = stations.map((station) => clonedTasks.filter((task) => task.assignedStationId === station.id).reduce((sum, task) => sum + task.duration, 0));
  let passes = 0;
  for (; passes < 50; passes++) {
    let improved = false;
    for (const task of clonedTasks) {
      const from = assignment.get(task.id)!;
      for (const to of [from - 1, from + 1]) {
        if (to < 0 || to >= stations.length || loads[to] + task.duration > maxAllowedCycleTime) continue;
        if (task.predecessors.some((id) => assignment.get(id)! > to) || successors.get(task.id)!.some((id) => assignment.get(id)! < to)) continue;
        const before = Math.abs(loads[from] - loads[to]);
        const after = Math.abs((loads[from] - task.duration) - (loads[to] + task.duration));
        if (after >= before - 1e-9) continue;
        loads[from] -= task.duration;
        loads[to] += task.duration;
        assignment.set(task.id, to);
        task.assignedStationId = stations[to].id;
        improved = true;
        break;
      }
    }
    if (!improved) break;
  }
  return finishResult('leveling', clonedStations, clonedTasks, maxAllowedCycleTime, [], `Leveling stopped after ${passes + 1} passes; this heuristic does not prove an optimum.`);
}

/** Shared deterministic engineering evaluator. A calculation never confers approval. */
import type {
  OperatingParameters, Task, Workstation, LineCalculations, EngineeringReason,
} from '../types/flowlab.ts';
import { validateLineInput, validateLineModel } from './project-validation.ts';

export const ENGINEERING_ASSUMPTIONS = [
  'Conservative sequential model: station cycle is the sum of task elapsed times; no task splitting or overlap is credited.',
  'Only one operator per station is supported. Additional operators do not accelerate machine or manual operations; multi-operator scheduling is unsupported.',
  'One dedicated operator is conservatively assumed occupied for every task, including machine dwell. Labor-content bounds are not a staffing study or a physical workstation minimum.',
  'Capacity is a nominal deterministic estimate, excluding startup, variability, shared-resource conflicts, failures and quality losses. OEE target is informational and is not applied.',
  'Skills, fixtures and ergonomics are descriptive metadata, not verified resource or safety constraints. A valid result is not engineering approval.',
];

/** Net scheduled seconds over the full demand period. */
export function calculateAvailableTime(params: OperatingParameters): number {
  if (!params) return 0;
  const { hoursPerShift, plannedDowntimeMinutesPerShift, shiftsPerDay, demandPeriodDays } = params;
  if (![hoursPerShift, plannedDowntimeMinutesPerShift, shiftsPerDay, demandPeriodDays].every(Number.isFinite)) return 0;
  const result = Math.max(0, hoursPerShift * 60 - plannedDowntimeMinutesPerShift) * 60 * shiftsPerDay * demandPeriodDays;
  return Number.isFinite(result) && result > 0 ? result : 0;
}

export function calculateTaktTime(params: OperatingParameters): number {
  const time = calculateAvailableTime(params);
  if (!params || !Number.isFinite(params.demandUnitsPerPeriod) || params.demandUnitsPerPeriod <= 0) return 0;
  const takt = time / params.demandUnitsPerPeriod;
  return Number.isFinite(takt) ? takt : 0;
}

export function calculateTargetCycleTime(params: OperatingParameters, taktTime: number): number {
  if (!Number.isFinite(params?.targetBufferPercent) || !Number.isFinite(taktTime)) return 0;
  if (params.targetBufferPercent < 0 || params.targetBufferPercent >= 100 || taktTime < 0) return 0;
  return taktTime * (1 - params.targetBufferPercent / 100);
}

/** Includes graph defects and assignment order, without recursive traversal. */
export function validatePrecedence(tasks: Task[], stations: Workstation[]): LineCalculations['precedenceErrors'] {
  const errors: LineCalculations['precedenceErrors'] = [];
  const issues = validateLineModel(stations, tasks);
  if (issues.length) return issues.map(issue => ({taskId:'',taskCode:'',predecessorId:'',predecessorCode:'',message:issue.message}));
  const taskMap = new Map(tasks.map(task => [task.id, task]));
  const stationIndex = new Map(stations.map((station, index) => [station.id, index]));
  for (const task of tasks) {
    if (!task.assignedStationId || !stationIndex.has(task.assignedStationId)) continue;
    for (const predecessorId of task.predecessors) {
      const predecessor = taskMap.get(predecessorId);
      if (!predecessor) continue; // Missing references already have graph diagnostics.
      const predecessorIndex = predecessor.assignedStationId ? stationIndex.get(predecessor.assignedStationId) : undefined;
      if (predecessorIndex === undefined || predecessorIndex > stationIndex.get(task.assignedStationId)!) {
        errors.push({
          taskId: task.id, taskCode: task.code, predecessorId, predecessorCode: predecessor.code,
          message: predecessorIndex === undefined
            ? `Task ${task.code} requires unassigned prerequisite ${predecessor.code}. Assign the prerequisite first.`
            : `Sequence violation: ${task.code} is before prerequisite ${predecessor.code}. Move the prerequisite to an earlier or equal station.`,
        });
      }
    }
  }
  return errors;
}

function emptyMetrics(reasons: EngineeringReason[]): LineCalculations {
  return {
    assessment: {status: 'invalid', reasons, assumptions: [...ENGINEERING_ASSUMPTIONS]},
    availableTimeSecondsPerDay: 0, availableTimeSecondsPerPeriod: 0,
    taktTimeSeconds: 0, targetCycleTimeSeconds: 0, totalWorkContentSeconds: 0,
    allocatedWorkContentSeconds: 0, allocatedVaRatioPercent: 0,
    bottleneckStationId: null, bottleneckCycleTime: 0, theoreticalMinWorkstations: 0,
    theoreticalMinOperators: 0, actualWorkstationsCount: 0, actualOperatorsCount: 0,
    lineBalancingEfficiencyPercent: 0, balancingLossPercent: 0, smoothnessIndex: 0,
    hourlyProductionCapacity: 0, dailyProductionCapacity: 0, periodProductionCapacity: 0,
    taktAttainmentAchieved: false, vaRatioPercent: 0, stationCalculations: [],
    unassignedTasks: [], precedenceErrors: [],
  };
}

/** Assess data, completeness, supported model and feasibility before any success claim. */
export function calculateLineMetrics(
  stations: Workstation[], tasks: Task[], params: OperatingParameters,
): LineCalculations {
  const issues = validateLineInput(stations, tasks, params);
  if (issues.length) return emptyMetrics(issues.map(issue => ({...issue, status: 'invalid'})));

  const reasons: EngineeringReason[] = [];
  const availableTimeSecondsPerPeriod = calculateAvailableTime(params);
  const availableTimeSecondsPerDay = availableTimeSecondsPerPeriod / params.demandPeriodDays;
  const taktTimeSeconds = calculateTaktTime(params);
  const targetCycleTimeSeconds = calculateTargetCycleTime(params, taktTimeSeconds);
  const totalWorkContentSeconds = tasks.reduce((total, task) => total + task.duration, 0);
  const totalVA = tasks.reduce((total, task) => total + (task.category === 'VA' ? task.duration : 0), 0);
  const unassignedTasks = tasks.filter(task => task.assignedStationId === null);
  const allocatedWorkContentSeconds = tasks.reduce((total, task) => total + (task.assignedStationId ? task.duration : 0), 0);
  const allocatedVA = tasks.reduce((total, task) => total + (task.assignedStationId && task.category === 'VA' ? task.duration : 0), 0);
  const actualOperatorsCount = stations.reduce((total, station) => total + station.operatorCount, 0);
  const grouped = new Map(stations.map(station => [station.id, [] as Task[]]));
  for (const task of tasks) if (task.assignedStationId) grouped.get(task.assignedStationId)!.push(task);

  let bottleneckStationId: string | null = null;
  let bottleneckCycleTime = 0;
  const raw = stations.map(station => {
    const assigned = grouped.get(station.id)!;
    const totalWorkContent = assigned.reduce((total, task) => total + task.duration, 0);
    if (totalWorkContent > bottleneckCycleTime) {
      bottleneckCycleTime = totalWorkContent;
      bottleneckStationId = station.id;
    }
    return {
      station, tasks: assigned, totalWorkContent, stationCycleTime: totalWorkContent,
      vaTime: assigned.reduce((total, task) => total + (task.category === 'VA' ? task.duration : 0), 0),
      nvarTime: assigned.reduce((total, task) => total + (task.category === 'NVAR' ? task.duration : 0), 0),
      nvaTime: assigned.reduce((total, task) => total + (task.category === 'NVA' ? task.duration : 0), 0),
    };
  });
  const theoreticalMinOperators = taktTimeSeconds > 0 ? Math.ceil(totalWorkContentSeconds / taktTimeSeconds) : 0;
  const hourlyProductionCapacity = bottleneckCycleTime > 0 ? Math.floor(3600 / bottleneckCycleTime) : 0;
  const dailyProductionCapacity = bottleneckCycleTime > 0 ? Math.floor(availableTimeSecondsPerDay / bottleneckCycleTime) : 0;
  const periodProductionCapacity = bottleneckCycleTime > 0 ? Math.floor(availableTimeSecondsPerPeriod / bottleneckCycleTime) : 0;
  // hypot avoids unnecessary squared intermediate overflow for representable magnitudes.
  const smoothnessIndex = raw.reduce((total, station) => Math.hypot(total, bottleneckCycleTime - station.stationCycleTime), 0);
  if (![totalWorkContentSeconds, allocatedWorkContentSeconds, actualOperatorsCount,
    availableTimeSecondsPerPeriod, availableTimeSecondsPerDay, theoreticalMinOperators,
    hourlyProductionCapacity, dailyProductionCapacity, periodProductionCapacity, smoothnessIndex,
  ].every(Number.isFinite) || availableTimeSecondsPerPeriod <= 0 || taktTimeSeconds <= 0) {
    return emptyMetrics([{code:'NUMERIC_RANGE',status:'invalid',message:'The input magnitude exceeds the supported calculation range. Reduce the time or demand values.'}]);
  }

  const stationCalculations = raw.map(station => ({
    ...station,
    isBottleneck: station.station.id === bottleneckStationId && bottleneckCycleTime > 0,
    isOverTakt: station.stationCycleTime > taktTimeSeconds,
    isOverTarget: station.stationCycleTime > targetCycleTimeSeconds,
    idleTimeSeconds: Math.max(0, taktTimeSeconds - station.stationCycleTime),
    utilizationPercent: station.stationCycleTime / taktTimeSeconds * 100,
  }));
  if (stationCalculations.some(station => !Number.isFinite(station.utilizationPercent))) {
    return emptyMetrics([{code:'NUMERIC_RANGE',status:'invalid',message:'Station utilization exceeds the supported calculation range. Reduce the time or demand values.'}]);
  }
  const precedenceErrors = validatePrecedence(tasks, stations);
  if (!tasks.length || !stations.length) reasons.push({code:'EMPTY_LINE',status:'incomplete',message:'Add at least one task and workstation before evaluating a complete line.'});
  if (unassignedTasks.length) reasons.push({code:'UNASSIGNED_TASKS',status:'incomplete',message:`Assign ${unassignedTasks.length} backlog task(s) before claiming complete-line capacity.`});
  for (const station of stations) {
    if (station.operatorCount !== 1) reasons.push({code:'MULTI_OPERATOR',status:'unsupported',message:`${station.code} has ${station.operatorCount} operators. Multi-operator scheduling is not modeled; all task times remain sequential.`});
    if (station.maxWorkplaceCapacity !== undefined && station.operatorCount > station.maxWorkplaceCapacity) reasons.push({code:'WORKPLACE_CAPACITY',status:'infeasible',message:`${station.code} exceeds its workplace operator capacity of ${station.maxWorkplaceCapacity}.`});
  }
  for (const error of precedenceErrors) reasons.push({code:'PRECEDENCE_ORDER',status:'infeasible',message:error.message});
  if (bottleneckCycleTime > taktTimeSeconds) reasons.push({code:'OVER_TAKT',status:'infeasible',message:`Bottleneck ${bottleneckCycleTime.toFixed(1)}s exceeds customer takt ${taktTimeSeconds.toFixed(1)}s. Reduce work or revise the operating plan.`});
  const status = (['invalid', 'incomplete', 'unsupported', 'infeasible'] as const).find(candidate => reasons.some(reason => reason.status === candidate)) ?? 'valid';
  // Divide before multiplying to keep representable percentage outputs finite.
  const efficiency = bottleneckCycleTime > 0 && actualOperatorsCount > 0
    ? Math.min(100, allocatedWorkContentSeconds / bottleneckCycleTime / actualOperatorsCount * 100) : 0;
  return {
    assessment: {status, reasons, assumptions:[...ENGINEERING_ASSUMPTIONS]},
    availableTimeSecondsPerDay, availableTimeSecondsPerPeriod, taktTimeSeconds, targetCycleTimeSeconds,
    totalWorkContentSeconds, allocatedWorkContentSeconds,
    allocatedVaRatioPercent: allocatedWorkContentSeconds > 0 ? allocatedVA / allocatedWorkContentSeconds * 100 : 0,
    bottleneckStationId, bottleneckCycleTime, theoreticalMinOperators, theoreticalMinWorkstations:theoreticalMinOperators,
    actualWorkstationsCount:stations.length, actualOperatorsCount,
    lineBalancingEfficiencyPercent:efficiency, balancingLossPercent:Math.max(0,100-efficiency), smoothnessIndex,
    hourlyProductionCapacity, dailyProductionCapacity, periodProductionCapacity,
    taktAttainmentAchieved: status === 'valid',
    vaRatioPercent:totalWorkContentSeconds > 0 ? totalVA / totalWorkContentSeconds * 100 : 0,
    stationCalculations, unassignedTasks, precedenceErrors,
  };
}

/**
 * LEANZR FlowLab - Industrial Engineering Pure Calculation Engine
 * Implements strict Lean Manufacturing & Industrial Engineering formulas.
 */

import type {
  OperatingParameters,
  Task,
  Workstation,
  StationCalculation,
  LineCalculations,
} from '../types/flowlab.ts';

/**
 * Calculates net available operating time in seconds per planning period.
 * Ta = Shifts * ((Hours * 60) - PlannedDowntimeMin) * 60
 */
export function calculateAvailableTime(params: OperatingParameters): number {
  const netMinutesPerShift = Math.max(0, params.hoursPerShift * 60 - params.plannedDowntimeMinutesPerShift);
  const netSecondsPerShift = netMinutesPerShift * 60;
  return netSecondsPerShift * params.shiftsPerDay * params.demandPeriodDays;
}

/**
 * Calculates customer Takt Time in seconds per unit.
 * Takt Time = Net Available Time / Customer Demand
 */
export function calculateTaktTime(params: OperatingParameters): number {
  const availableTime = calculateAvailableTime(params);
  if (params.demandUnitsPerPeriod <= 0 || availableTime <= 0) {
    return 0;
  }
  return availableTime / params.demandUnitsPerPeriod;
}

/**
 * Calculates Target Cycle Time (TCT) with engineering safety buffer.
 * TCT = Takt Time * (1 - (bufferPercent / 100))
 */
export function calculateTargetCycleTime(params: OperatingParameters, taktTime: number): number {
  const buffer = Math.max(0, Math.min(params.targetBufferPercent, 50)) / 100;
  return taktTime * (1 - buffer);
}

/**
 * Validates precedence constraints across workstations.
 * If Task B depends on Task A, Task A must be assigned to an earlier or equal workstation.
 * If either is unassigned, it is flagged if dependent is placed but prerequisite is unassigned.
 */
export function validatePrecedence(
  tasks: Task[],
  stations: Workstation[]
): LineCalculations['precedenceErrors'] {
  const errors: LineCalculations['precedenceErrors'] = [];
  const taskMap = new Map<string, Task>();
  tasks.forEach((t) => taskMap.set(t.id, t));

  const stationIndexMap = new Map<string, number>();
  stations.forEach((s, idx) => stationIndexMap.set(s.id, idx));

  for (const task of tasks) {
    if (!task.assignedStationId) continue;
    const taskStationIdx = stationIndexMap.get(task.assignedStationId);
    if (taskStationIdx === undefined) continue;

    for (const predId of task.predecessors) {
      const pred = taskMap.get(predId);
      if (!pred) continue;

      if (!pred.assignedStationId) {
        errors.push({
          taskId: task.id,
          taskCode: task.code,
          predecessorId: pred.id,
          predecessorCode: pred.code,
          message: `Task ${task.code} is assigned to ${stations[taskStationIdx]?.code ?? 'a station'}, but its prerequisite ${pred.code} is unassigned.`,
        });
      } else {
        const predStationIdx = stationIndexMap.get(pred.assignedStationId);
        if (predStationIdx !== undefined && predStationIdx > taskStationIdx) {
          errors.push({
            taskId: task.id,
            taskCode: task.code,
            predecessorId: pred.id,
            predecessorCode: pred.code,
            message: `Sequence violation: Task ${task.code} (${stations[taskStationIdx]?.code}) cannot precede prerequisite ${pred.code} (${stations[predStationIdx]?.code}).`,
          });
        }
      }
    }
  }

  return errors;
}

/**
 * Evaluates entire production line performance, Yamazumi distribution,
 * efficiency, smoothness index, and bottleneck.
 */
export function calculateLineMetrics(
  stations: Workstation[],
  tasks: Task[],
  params: OperatingParameters
): LineCalculations {
  const availableTimeSecondsPerDay = calculateAvailableTime(params);
  const taktTimeSeconds = calculateTaktTime(params);
  const targetCycleTimeSeconds = calculateTargetCycleTime(params, taktTimeSeconds);

  // Group tasks by station
  const stationTaskMap = new Map<string, Task[]>();
  const unassignedTasks: Task[] = [];

  stations.forEach((s) => stationTaskMap.set(s.id, []));

  tasks.forEach((t) => {
    if (t.assignedStationId && stationTaskMap.has(t.assignedStationId)) {
      stationTaskMap.get(t.assignedStationId)!.push(t);
    } else {
      unassignedTasks.push(t);
    }
  });

  let totalWorkContentSeconds = 0;
  let totalVaSeconds = 0;
  let maxStationCycleTime = 0;
  let bottleneckStationId: string | null = null;
  let totalOperators = 0;

  const rawStationCalcs = stations.map((station) => {
    const assigned = stationTaskMap.get(station.id) || [];
    const opCount = Math.max(1, station.operatorCount || 1);
    totalOperators += opCount;

    let workContent = 0;
    let va = 0;
    let nvar = 0;
    let nva = 0;

    assigned.forEach((t) => {
      workContent += t.duration;
      if (t.category === 'VA') va += t.duration;
      else if (t.category === 'NVAR') nvar += t.duration;
      else if (t.category === 'NVA') nva += t.duration;
    });

    totalWorkContentSeconds += workContent;
    totalVaSeconds += va;

    const stationCycleTime = opCount > 0 ? workContent / opCount : workContent;

    if (stationCycleTime > maxStationCycleTime) {
      maxStationCycleTime = stationCycleTime;
      bottleneckStationId = station.id;
    }

    return {
      station,
      tasks: assigned,
      totalWorkContent: workContent,
      stationCycleTime,
      vaTime: va,
      nvarTime: nvar,
      nvaTime: nva,
      opCount,
    };
  });

  // Second pass for bottleneck flagging and metrics
  const stationCalculations: StationCalculation[] = rawStationCalcs.map((item) => {
    const isBottleneck = item.station.id === bottleneckStationId && maxStationCycleTime > 0;
    const isOverTakt = taktTimeSeconds > 0 && item.stationCycleTime > taktTimeSeconds;
    const isOverTarget = targetCycleTimeSeconds > 0 && item.stationCycleTime > targetCycleTimeSeconds;
    const idleTimeSeconds = taktTimeSeconds > 0 ? Math.max(0, taktTimeSeconds - item.stationCycleTime) : 0;
    const utilizationPercent = taktTimeSeconds > 0 ? (item.stationCycleTime / taktTimeSeconds) * 100 : 0;

    return {
      station: item.station,
      tasks: item.tasks,
      totalWorkContent: item.totalWorkContent,
      stationCycleTime: item.stationCycleTime,
      vaTime: item.vaTime,
      nvarTime: item.nvarTime,
      nvaTime: item.nvaTime,
      isBottleneck,
      isOverTakt,
      isOverTarget,
      idleTimeSeconds,
      utilizationPercent,
    };
  });

  const theoreticalMinWorkstations = taktTimeSeconds > 0
    ? Math.max(1, Math.ceil(totalWorkContentSeconds / taktTimeSeconds))
    : 1;

  // Line Balancing Efficiency (LE)
  // LE = (Sum of task times) / (Total operators * Bottleneck cycle time) * 100
  let lineBalancingEfficiencyPercent = 0;
  if (totalOperators > 0 && maxStationCycleTime > 0) {
    lineBalancingEfficiencyPercent = Math.min(
      100,
      (totalWorkContentSeconds / (totalOperators * maxStationCycleTime)) * 100
    );
  }

  const balancingLossPercent = Math.max(0, 100 - lineBalancingEfficiencyPercent);

  // Smoothness Index: sqrt(Sum((maxCycleTime - stationCycleTime)^2))
  let sumSquaredDeviations = 0;
  stationCalculations.forEach((sc) => {
    const diff = maxStationCycleTime - sc.stationCycleTime;
    sumSquaredDeviations += diff * diff;
  });
  const smoothnessIndex = Math.sqrt(sumSquaredDeviations);

  // Capacities
  const hourlyProductionCapacity = maxStationCycleTime > 0
    ? Math.floor(3600 / maxStationCycleTime)
    : 0;
  const dailyProductionCapacity = maxStationCycleTime > 0
    ? Math.floor(availableTimeSecondsPerDay / maxStationCycleTime)
    : 0;

  const taktAttainmentAchieved = taktTimeSeconds > 0 && maxStationCycleTime <= taktTimeSeconds && unassignedTasks.length === 0;

  const vaRatioPercent = totalWorkContentSeconds > 0
    ? (totalVaSeconds / totalWorkContentSeconds) * 100
    : 0;

  const precedenceErrors = validatePrecedence(tasks, stations);

  return {
    availableTimeSecondsPerDay,
    taktTimeSeconds,
    targetCycleTimeSeconds,
    totalWorkContentSeconds,
    bottleneckStationId,
    bottleneckCycleTime: maxStationCycleTime,
    theoreticalMinWorkstations,
    actualWorkstationsCount: stations.length,
    actualOperatorsCount: totalOperators,
    lineBalancingEfficiencyPercent,
    balancingLossPercent,
    smoothnessIndex,
    hourlyProductionCapacity,
    dailyProductionCapacity,
    taktAttainmentAchieved,
    vaRatioPercent,
    stationCalculations,
    unassignedTasks,
    precedenceErrors,
  };
}

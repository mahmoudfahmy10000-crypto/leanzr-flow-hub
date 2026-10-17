/**
 * LEANZR FlowLab - Deterministic Line Balancing Optimizer
 * Implements classical Industrial Engineering algorithms:
 * 1. Ranked Positional Weight (RPW / Helgeson-Birnie)
 * 2. Longest Processing Time with Precedence (LPT-P)
 * 3. Workload Leveling & Variance Minimization (Smoothness Optimizer)
 */

import type { Task, Workstation } from '../types/flowlab.ts';

export interface OptimizationResult {
  algorithm: 'rpw' | 'lpt' | 'leveling';
  stations: Workstation[];
  tasks: Task[]; // updated with assignedStationId
  stationsCount: number;
  maxCycleTime: number;
  efficiencyPercent: number;
  smoothnessIndex: number;
  unassignedTasksCount: number;
  summary: string;
}

/**
 * Builds successor graph for positional weight calculation.
 */
function buildSuccessorGraph(tasks: Task[]): {
  directSuccessors: Map<string, string[]>;
  allSuccessors: Map<string, Set<string>>;
} {
  const directSuccessors = new Map<string, string[]>();
  tasks.forEach((t) => directSuccessors.set(t.id, []));

  tasks.forEach((task) => {
    task.predecessors.forEach((predId) => {
      if (directSuccessors.has(predId)) {
        directSuccessors.get(predId)!.push(task.id);
      }
    });
  });

  const allSuccessors = new Map<string, Set<string>>();

  function getDescendants(taskId: string): Set<string> {
    if (allSuccessors.has(taskId)) {
      return allSuccessors.get(taskId)!;
    }
    const descendants = new Set<string>();
    const children = directSuccessors.get(taskId) || [];
    for (const childId of children) {
      descendants.add(childId);
      const subDescendants = getDescendants(childId);
      subDescendants.forEach((d) => descendants.add(d));
    }
    allSuccessors.set(taskId, descendants);
    return descendants;
  }

  tasks.forEach((t) => getDescendants(t.id));

  return { directSuccessors, allSuccessors };
}

/**
 * Calculates Ranked Positional Weight for every task.
 * Positional Weight = task.duration + sum of durations of all successor tasks.
 */
export function calculatePositionalWeights(tasks: Task[]): Map<string, number> {
  const { allSuccessors } = buildSuccessorGraph(tasks);
  const taskMap = new Map<string, Task>();
  tasks.forEach((t) => taskMap.set(t.id, t));

  const weights = new Map<string, number>();

  tasks.forEach((task) => {
    const successors = allSuccessors.get(task.id) || new Set();
    let totalWeight = task.duration;
    successors.forEach((succId) => {
      const succTask = taskMap.get(succId);
      if (succTask) {
        totalWeight += succTask.duration;
      }
    });
    weights.set(task.id, totalWeight);
  });

  return weights;
}

/**
 * Validates whether a candidate task's predecessors have all been assigned to stationIndex or earlier.
 */
function arePredecessorsSatisfied(
  task: Task,
  assignedMap: Map<string, number>, // taskId -> stationIndex
  currentStationIndex: number
): boolean {
  for (const predId of task.predecessors) {
    if (!assignedMap.has(predId)) {
      return false;
    }
    const predStationIdx = assignedMap.get(predId)!;
    if (predStationIdx > currentStationIndex) {
      return false;
    }
  }
  return true;
}

/**
 * Ranked Positional Weight (RPW / Helgeson-Birnie)
 * Strategy: Pack stations sequentially up to maxStationTime while respecting precedence.
 */
export function runRPWOptimization(
  tasks: Task[],
  targetCycleTime: number,
  existingStations?: Workstation[]
): OptimizationResult {
  const positionalWeights = calculatePositionalWeights(tasks);

  // Sort tasks descending by positional weight
  const sortedTasks = [...tasks].sort((a, b) => {
    const weightA = positionalWeights.get(a.id) || 0;
    const weightB = positionalWeights.get(b.id) || 0;
    if (weightB !== weightA) return weightB - weightA;
    return b.duration - a.duration;
  });

  const assignedMap = new Map<string, number>(); // taskId -> stationIndex
  const stationTaskLists: Task[][] = [[]];
  const stationWorkContent: number[] = [0];

  const unassignedPool = new Set(sortedTasks.map((t) => t.id));
  const taskMap = new Map<string, Task>();
  sortedTasks.forEach((t) => taskMap.set(t.id, t));

  let currentStationIdx = 0;
  let progressMade = true;

  while (unassignedPool.size > 0 && progressMade) {
    progressMade = false;

    // Find first task in sorted order that satisfies precedence and fits within targetCycleTime
    let candidateFound: Task | null = null;

    for (const task of sortedTasks) {
      if (!unassignedPool.has(task.id)) continue;

      if (!arePredecessorsSatisfied(task, assignedMap, currentStationIdx)) {
        continue;
      }

      // Check if it fits
      if (stationWorkContent[currentStationIdx] + task.duration <= targetCycleTime) {
        candidateFound = task;
        break;
      }
    }

    if (candidateFound) {
      // Assign to current station
      stationTaskLists[currentStationIdx].push(candidateFound);
      stationWorkContent[currentStationIdx] += candidateFound.duration;
      assignedMap.set(candidateFound.id, currentStationIdx);
      unassignedPool.delete(candidateFound.id);
      progressMade = true;
    } else {
      // If no task fits in current station, but current station has work, open a new station
      if (stationWorkContent[currentStationIdx] > 0) {
        currentStationIdx++;
        stationTaskLists.push([]);
        stationWorkContent.push(0);
        progressMade = true;
      } else {
        // Even an empty station cannot fit the next feasible task (task duration > targetCycleTime)
        // In that case, assign the single largest feasible task alone to this station to avoid deadlock
        for (const task of sortedTasks) {
          if (!unassignedPool.has(task.id)) continue;
          if (arePredecessorsSatisfied(task, assignedMap, currentStationIdx)) {
            candidateFound = task;
            break;
          }
        }

        if (candidateFound) {
          stationTaskLists[currentStationIdx].push(candidateFound);
          stationWorkContent[currentStationIdx] += candidateFound.duration;
          assignedMap.set(candidateFound.id, currentStationIdx);
          unassignedPool.delete(candidateFound.id);
          progressMade = true;
        }
      }
    }
  }

  // Generate workstation structures
  const generatedStations: Workstation[] = stationTaskLists.map((_, idx) => {
    if (existingStations && existingStations[idx]) {
      return { ...existingStations[idx] };
    }
    return {
      id: `station-${idx + 1}`,
      name: `Station ${idx + 1}`,
      code: `ST-0${idx + 1}`,
      operatorCount: 1,
    };
  });

  // Assign updated station IDs to tasks
  const updatedTasks: Task[] = tasks.map((task) => {
    const stIdx = assignedMap.get(task.id);
    if (stIdx !== undefined && generatedStations[stIdx]) {
      return { ...task, assignedStationId: generatedStations[stIdx].id };
    }
    return { ...task, assignedStationId: null };
  });

  const maxCT = Math.max(...stationWorkContent, 0);
  const totalWork = stationWorkContent.reduce((a, b) => a + b, 0);
  const efficiency = maxCT > 0 && generatedStations.length > 0
    ? (totalWork / (generatedStations.length * maxCT)) * 100
    : 0;

  const smoothness = Math.sqrt(
    stationWorkContent.reduce((sum, ct) => sum + Math.pow(maxCT - ct, 2), 0)
  );

  return {
    algorithm: 'rpw',
    stations: generatedStations,
    tasks: updatedTasks,
    stationsCount: generatedStations.length,
    maxCycleTime: maxCT,
    efficiencyPercent: efficiency,
    smoothnessIndex: smoothness,
    unassignedTasksCount: unassignedPool.size,
    summary: `RPW balanced ${tasks.length} tasks across ${generatedStations.length} stations with ${efficiency.toFixed(1)}% line efficiency.`,
  };
}

/**
 * Longest Processing Time with Precedence (LPT-P)
 * Prioritizes the most time-consuming operations first.
 */
export function runLPTOptimization(
  tasks: Task[],
  targetCycleTime: number,
  existingStations?: Workstation[]
): OptimizationResult {
  // Sort tasks descending by duration
  const sortedTasks = [...tasks].sort((a, b) => b.duration - a.duration);

  const assignedMap = new Map<string, number>();
  const stationTaskLists: Task[][] = [[]];
  const stationWorkContent: number[] = [0];

  const unassignedPool = new Set(sortedTasks.map((t) => t.id));
  const taskMap = new Map<string, Task>();
  sortedTasks.forEach((t) => taskMap.set(t.id, t));

  let currentStationIdx = 0;
  let progressMade = true;

  while (unassignedPool.size > 0 && progressMade) {
    progressMade = false;
    let candidateFound: Task | null = null;

    for (const task of sortedTasks) {
      if (!unassignedPool.has(task.id)) continue;
      if (!arePredecessorsSatisfied(task, assignedMap, currentStationIdx)) continue;

      if (stationWorkContent[currentStationIdx] + task.duration <= targetCycleTime) {
        candidateFound = task;
        break;
      }
    }

    if (candidateFound) {
      stationTaskLists[currentStationIdx].push(candidateFound);
      stationWorkContent[currentStationIdx] += candidateFound.duration;
      assignedMap.set(candidateFound.id, currentStationIdx);
      unassignedPool.delete(candidateFound.id);
      progressMade = true;
    } else {
      if (stationWorkContent[currentStationIdx] > 0) {
        currentStationIdx++;
        stationTaskLists.push([]);
        stationWorkContent.push(0);
        progressMade = true;
      } else {
        // Fallback for single task exceeding takt
        for (const task of sortedTasks) {
          if (!unassignedPool.has(task.id)) continue;
          if (arePredecessorsSatisfied(task, assignedMap, currentStationIdx)) {
            candidateFound = task;
            break;
          }
        }
        if (candidateFound) {
          stationTaskLists[currentStationIdx].push(candidateFound);
          stationWorkContent[currentStationIdx] += candidateFound.duration;
          assignedMap.set(candidateFound.id, currentStationIdx);
          unassignedPool.delete(candidateFound.id);
          progressMade = true;
        }
      }
    }
  }

  const generatedStations: Workstation[] = stationTaskLists.map((_, idx) => {
    if (existingStations && existingStations[idx]) {
      return { ...existingStations[idx] };
    }
    return {
      id: `station-${idx + 1}`,
      name: `Station ${idx + 1}`,
      code: `ST-0${idx + 1}`,
      operatorCount: 1,
    };
  });

  const updatedTasks: Task[] = tasks.map((task) => {
    const stIdx = assignedMap.get(task.id);
    if (stIdx !== undefined && generatedStations[stIdx]) {
      return { ...task, assignedStationId: generatedStations[stIdx].id };
    }
    return { ...task, assignedStationId: null };
  });

  const maxCT = Math.max(...stationWorkContent, 0);
  const totalWork = stationWorkContent.reduce((a, b) => a + b, 0);
  const efficiency = maxCT > 0 && generatedStations.length > 0
    ? (totalWork / (generatedStations.length * maxCT)) * 100
    : 0;

  const smoothness = Math.sqrt(
    stationWorkContent.reduce((sum, ct) => sum + Math.pow(maxCT - ct, 2), 0)
  );

  return {
    algorithm: 'lpt',
    stations: generatedStations,
    tasks: updatedTasks,
    stationsCount: generatedStations.length,
    maxCycleTime: maxCT,
    efficiencyPercent: efficiency,
    smoothnessIndex: smoothness,
    unassignedTasksCount: unassignedPool.size,
    summary: `LPT balanced ${tasks.length} tasks across ${generatedStations.length} stations with bottleneck cycle time ${maxCT}s.`,
  };
}

/**
 * Workload Leveling & 2-Opt Heuristic
 * Takes existing stations and balances variance by moving tasks across adjacent stations
 * without breaking precedence or violating maximum cycle time.
 */
export function runSmoothnessLeveling(
  stations: Workstation[],
  tasks: Task[],
  maxAllowedCycleTime: number
): OptimizationResult {
  const stationIndexMap = new Map<string, number>();
  stations.forEach((s, idx) => stationIndexMap.set(s.id, idx));

  const stationTasks: Task[][] = stations.map(() => []);
  const taskMap = new Map<string, Task>();
  tasks.forEach((t) => taskMap.set(t.id, t));

  // Partition currently assigned tasks
  tasks.forEach((t) => {
    if (t.assignedStationId && stationIndexMap.has(t.assignedStationId)) {
      const idx = stationIndexMap.get(t.assignedStationId)!;
      stationTasks[idx].push({ ...t });
    }
  });

  const getStationWork = (idx: number) =>
    stationTasks[idx].reduce((sum, t) => sum + t.duration, 0) / Math.max(1, stations[idx].operatorCount);

  // Check if moving task from station A to station B is valid precedence-wise
  const isMoveValid = (task: Task, fromIdx: number, toIdx: number): boolean => {
    // 1. All predecessors of task must be at station <= toIdx
    for (const predId of task.predecessors) {
      const pred = taskMap.get(predId);
      if (!pred || !pred.assignedStationId) continue;
      const predIdx = stationIndexMap.get(pred.assignedStationId);
      if (predIdx !== undefined && predIdx > toIdx) {
        return false;
      }
    }

    // 2. All successors of task must be at station >= toIdx
    for (const other of tasks) {
      if (other.predecessors.includes(task.id) && other.assignedStationId) {
        const succIdx = stationIndexMap.get(other.assignedStationId);
        if (succIdx !== undefined && succIdx < toIdx) {
          return false;
        }
      }
    }

    return true;
  };

  // Iterative leveling passes
  let improved = true;
  let iterations = 0;

  while (improved && iterations < 50) {
    improved = false;
    iterations++;

    // Find most loaded station and least loaded station
    let maxIdx = 0;
    let minIdx = 0;
    let maxWork = getStationWork(0);
    let minWork = getStationWork(0);

    for (let i = 1; i < stations.length; i++) {
      const w = getStationWork(i);
      if (w > maxWork) {
        maxWork = w;
        maxIdx = i;
      }
      if (w < minWork) {
        minWork = w;
        minIdx = i;
      }
    }

    if (maxWork - minWork <= 3) {
      break; // Already nicely leveled
    }

    // Try to move a task from maxIdx to an adjacent or valid target station
    const candidateTasks = stationTasks[maxIdx];

    for (let i = 0; i < candidateTasks.length; i++) {
      const task = candidateTasks[i];
      const targetIdx = maxIdx > minIdx ? maxIdx - 1 : maxIdx + 1;

      if (targetIdx >= 0 && targetIdx < stations.length) {
        const targetWork = getStationWork(targetIdx);
        const newTaskWork = task.duration / Math.max(1, stations[targetIdx].operatorCount);

        if (targetWork + newTaskWork <= maxAllowedCycleTime && isMoveValid(task, maxIdx, targetIdx)) {
          // Check if this move actually improves balance
          const currentDiff = Math.abs(maxWork - targetWork);
          const newDiff = Math.abs((maxWork - (task.duration / Math.max(1, stations[maxIdx].operatorCount))) - (targetWork + newTaskWork));

          if (newDiff < currentDiff) {
            // Apply move
            candidateTasks.splice(i, 1);
            stationTasks[targetIdx].push(task);
            task.assignedStationId = stations[targetIdx].id;
            improved = true;
            break;
          }
        }
      }
    }
  }

  // Flatten updated tasks
  const updatedTasks: Task[] = tasks.map((orig) => {
    const found = taskMap.get(orig.id);
    return found ? { ...found } : orig;
  });

  const finalStationTimes = stations.map((_, idx) => getStationWork(idx));
  const maxCT = Math.max(...finalStationTimes, 0);
  const totalWork = finalStationTimes.reduce((a, b) => a + b, 0);
  const totalOps = stations.reduce((sum, s) => sum + Math.max(1, s.operatorCount), 0);

  const efficiency = maxCT > 0 && totalOps > 0
    ? (totalWork / (totalOps * maxCT)) * 100
    : 0;

  const smoothness = Math.sqrt(
    finalStationTimes.reduce((sum, ct) => sum + Math.pow(maxCT - ct, 2), 0)
  );

  return {
    algorithm: 'leveling',
    stations,
    tasks: updatedTasks,
    stationsCount: stations.length,
    maxCycleTime: maxCT,
    efficiencyPercent: efficiency,
    smoothnessIndex: smoothness,
    unassignedTasksCount: updatedTasks.filter((t) => !t.assignedStationId).length,
    summary: `Heuristic leveling converged in ${iterations} passes. Smoothness Index: ${smoothness.toFixed(1)}s.`,
  };
}

import type { FlowProject, Task } from '../types/flowlab.ts';

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { valid: true; value: T; issues: ValidationIssue[] }
  | { valid: false; issues: ValidationIssue[] };

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function add(issues: ValidationIssue[], code: string, path: string, message: string) {
  issues.push({ code, path, message });
}

function checkText(value: unknown, path: string, issues: ValidationIssue[], allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    add(issues, 'shape.string', path, `${path} must be ${allowEmpty ? 'a string' : 'a nonempty string'}.`);
  }
}

function checkOptionalText(record: RecordValue, key: string, path: string, issues: ValidationIssue[]) {
  if (record[key] !== undefined) checkText(record[key], `${path}.${key}`, issues, true);
}

function checkStringList(value: unknown, path: string, issues: ValidationIssue[]) {
  if (!Array.isArray(value)) {
    add(issues, 'shape.array', path, `${path} must be an array of nonempty strings.`);
    return;
  }
  value.forEach((entry, index) => checkText(entry, `${path}[${index}]`, issues));
}

function checkPositive(value: unknown, path: string, issues: ValidationIssue[], integer = false) {
  if (!isFiniteNumber(value)) {
    add(issues, 'number.finite', path, `${path} must be a finite number.`);
  } else if (value <= 0) {
    add(issues, 'number.positive', path, `${path} must be greater than zero.`);
  } else if (integer && !Number.isSafeInteger(value)) {
    add(issues, 'number.integer', path, `${path} must be a positive safe integer.`);
  }
}

function checkDate(value: unknown, path: string, issues: ValidationIssue[]) {
  if (!isText(value) || !Number.isFinite(Date.parse(value))) {
    add(issues, 'shape.date', path, `${path} must be a valid date/time string.`);
  }
}

function checkUnique(
  records: unknown[], key: 'id' | 'code', path: string, issues: ValidationIssue[],
) {
  const seen = new Map<string, number>();
  records.forEach((record, index) => {
    if (!isRecord(record) || !isText(record[key])) return;
    const identity = key === 'code' ? record[key].trim().toLocaleLowerCase('en-US') : record[key];
    const previous = seen.get(identity);
    if (previous !== undefined) {
      add(issues, `identity.duplicate_${key}`, `${path}[${index}].${key}`,
        `${path}[${index}].${key} duplicates ${path}[${previous}].${key} (${record[key]}). Use a unique ${key}.`);
    } else {
      seen.set(identity, index);
    }
  });
}

function uniqueIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter(issue => {
    const key = `${issue.code}\0${issue.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * JSON persistence must not turn extension metadata into null, discard supported
 * values, or recurse through a cycle. Undefined object properties are permitted
 * as absent optional fields; undefined array entries would become null and fail.
 * Explicit enter/exit frames distinguish cyclic ancestors from shared references.
 */
function validateJSONValues(value: unknown, rootPath: string): ValidationIssue[] {
  type Frame = { kind: 'visit'; value: unknown; path: string; arrayEntry?: boolean }
    | { kind: 'exit'; value: object };
  const issues: ValidationIssue[] = [];
  const stack: Frame[] = [{ kind: 'visit', value, path: rootPath }];
  const ancestors = new WeakMap<object, string>();
  const completed = new WeakSet<object>();
  const propertyPath = (path: string, key: string) => /^[A-Za-z_$][\w$]*$/.test(key)
    ? (path ? `${path}.${key}` : key)
    : `${path || '$'}[${JSON.stringify(key)}]`;
  while (stack.length) {
    const frame = stack.pop()!;
    if (frame.kind === 'exit') {
      ancestors.delete(frame.value);
      completed.add(frame.value);
      continue;
    }
    const { value: current } = frame;
    const path = frame.path || '$';
    if (current === null || typeof current === 'string' || typeof current === 'boolean') continue;
    if (current === undefined && !frame.arrayEntry) continue;
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) add(issues, 'number.finite', path,
        `${path} must be a finite number. JSON storage would replace this value with null.`);
      continue;
    }
    if (typeof current !== 'object') {
      add(issues, 'json.unsupported_value', path,
        `${path} contains an unsupported ${typeof current} value. Use JSON-compatible metadata before saving.`);
      continue;
    }
    const ancestor = ancestors.get(current);
    if (ancestor !== undefined) {
      add(issues, 'json.cycle', path,
        `${path} points back to ${ancestor || '$'}, creating a circular data reference. Remove the cycle before saving.`);
      continue;
    }
    if (completed.has(current)) continue;
    const isArray = Array.isArray(current);
    const prototype = Object.getPrototypeOf(current);
    if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      add(issues, 'json.unsupported_object', path,
        `${path} must contain plain JSON objects or arrays. Convert object instances to explicit JSON values before saving.`);
      continue;
    }
    if (Object.getOwnPropertySymbols(current).length) {
      add(issues, 'json.unsupported_property', path,
        `${path} has symbol-keyed properties that JSON storage would discard. Use string property names.`);
    }
    ancestors.set(current, frame.path);
    stack.push({ kind: 'exit', value: current });
    if (isArray) {
      for (const key of Object.keys(current)) {
        const index = Number(key);
        if (!Number.isInteger(index) || index < 0 || index >= current.length || String(index) !== key) {
          add(issues, 'json.unsupported_property', propertyPath(frame.path, key),
            `${propertyPath(frame.path, key)} is an extra array property that JSON storage would discard. Store it in a plain object.`);
        }
      }
      for (let index = current.length - 1; index >= 0; index--) {
        const childPath = `${frame.path || '$'}[${index}]`;
        const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
        if (descriptor && !('value' in descriptor)) {
          add(issues, 'json.unsupported_property', childPath,
            `${childPath} is an accessor property. Store an explicit JSON value so saving cannot change it.`);
        } else {
          stack.push({ kind: 'visit', value: descriptor?.value, path: childPath, arrayEntry: true });
        }
      }
    } else {
      const entries = Object.entries(Object.getOwnPropertyDescriptors(current));
      for (let index = entries.length - 1; index >= 0; index--) {
        const [key, descriptor] = entries[index];
        if (!descriptor.enumerable) continue;
        const childPath = propertyPath(frame.path, key);
        if (!('value' in descriptor)) {
          add(issues, 'json.unsupported_property', childPath,
            `${childPath} is an accessor property. Store an explicit JSON value so saving cannot change it.`);
        } else {
          stack.push({ kind: 'visit', value: descriptor.value, path: childPath });
        }
      }
    }
  }
  return issues;
}

/** Validate the schedule and unit ranges without coercing, clamping, or modifying input. */
export function validateOperatingParameters(params: unknown): ValidationIssue[] {
  const issues = validateJSONValues(params, 'operatingParams');
  const path = 'operatingParams';
  if (issues.length) return issues;
  if (!isRecord(params)) {
    return [{ code: 'shape.object', path, message: 'operatingParams must be an object.' }];
  }
  for (const key of ['demandUnitsPerPeriod', 'demandPeriodDays', 'hoursPerShift']) {
    checkPositive(params[key], `${path}.${key}`, issues);
  }
  checkPositive(params.shiftsPerDay, `${path}.shiftsPerDay`, issues, true);
  if (isFiniteNumber(params.hoursPerShift) && params.hoursPerShift > 24) {
    add(issues, 'number.range', `${path}.hoursPerShift`, 'A shift cannot exceed 24 hours.');
  }
  if (isFiniteNumber(params.shiftsPerDay) && isFiniteNumber(params.hoursPerShift)
      && params.shiftsPerDay * params.hoursPerShift > 24) {
    add(issues, 'schedule.overlap', `${path}.shiftsPerDay`,
      'shiftsPerDay × hoursPerShift exceeds 24 hours per day. Correct the daily schedule.');
  }
  const downtime = params.plannedDowntimeMinutesPerShift;
  if (!isFiniteNumber(downtime)) {
    add(issues, 'number.finite', `${path}.plannedDowntimeMinutesPerShift`, 'Planned downtime must be a finite number of minutes.');
  } else if (downtime < 0) {
    add(issues, 'number.range', `${path}.plannedDowntimeMinutesPerShift`, 'Planned downtime cannot be negative.');
  } else if (isFiniteNumber(params.hoursPerShift) && downtime >= params.hoursPerShift * 60) {
    add(issues, 'schedule.downtime', `${path}.plannedDowntimeMinutesPerShift`,
      'Planned downtime must be shorter than the shift so productive time remains.');
  }
  for (const [key, minInclusive, maxInclusive] of [
    ['oeeTargetPercent', false, true], ['targetBufferPercent', true, false],
  ] as const) {
    const value = params[key];
    if (!isFiniteNumber(value)) {
      add(issues, 'number.finite', `${path}.${key}`, `${key} must be a finite percentage.`);
    } else if ((minInclusive ? value < 0 : value <= 0) || (maxInclusive ? value > 100 : value >= 100)) {
      add(issues, 'number.range', `${path}.${key}`,
        `${key} must be ${minInclusive ? 'at least 0' : 'greater than 0'} and ${maxInclusive ? 'at most 100' : 'less than 100'} percent.`);
    }
  }
  return uniqueIssues(issues);
}

interface GraphNode {
  task: Task;
  index: number;
  predecessors: string[];
  successors: string[];
}

/**
 * Iterative Kahn ordering plus iterative SCC/cycle diagnostics. No recursion is
 * used, including for deep graphs or the error path. A failed graph returns no
 * partial order, so callers cannot mistake a partial traversal for a valid DAG.
 */
export function topologicalTaskOrder(tasks: Task[]): { order: Task[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(tasks)) {
    return { order: [], issues: [{ code: 'shape.array', path: 'tasks', message: 'tasks must be an array.' }] };
  }
  const graph = new Map<string, GraphNode>();
  tasks.forEach((task, index) => {
    const path = `tasks[${index}]`;
    if (!isRecord(task)) {
      add(issues, 'shape.object', path, `${path} must be an object.`);
      return;
    }
    checkText(task.id, `${path}.id`, issues);
    if (!isText(task.id)) return;
    if (graph.has(task.id)) {
      add(issues, 'identity.duplicate_id', `${path}.id`, `Task ID ${task.id} is duplicated. Use unique task IDs.`);
      return;
    }
    checkStringList(task.predecessors, `${path}.predecessors`, issues);
    const predecessors = Array.isArray(task.predecessors) ? task.predecessors.filter(isText) : [];
    graph.set(task.id, { task: task as unknown as Task, index, predecessors, successors: [] });
  });
  for (const [id, node] of graph) {
    const seen = new Set<string>();
    node.predecessors.forEach((predecessorId, predecessorIndex) => {
      const path = `tasks[${node.index}].predecessors[${predecessorIndex}]`;
      if (seen.has(predecessorId)) {
        add(issues, 'graph.duplicate_predecessor', path,
          `${node.task.code || id} repeats predecessor ${predecessorId}. List each predecessor once.`);
      } else if (!graph.has(predecessorId)) {
        add(issues, 'graph.missing_predecessor', path,
          `${node.task.code || id} references missing predecessor ${predecessorId}. Restore the task or correct the reference.`);
      } else {
        graph.get(predecessorId)!.successors.push(id);
      }
      seen.add(predecessorId);
    });
  }
  if (issues.length) return { order: [], issues };

  const indegree = new Map([...graph].map(([id, node]) => [id, node.predecessors.length]));
  const queue = [...graph.keys()].filter(id => indegree.get(id) === 0);
  const order: Task[] = [];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor];
    const node = graph.get(id)!;
    order.push(node.task);
    for (const successor of node.successors) {
      const remaining = indegree.get(successor)! - 1;
      indegree.set(successor, remaining);
      if (remaining === 0) queue.push(successor);
    }
  }
  if (order.length === tasks.length) return { order, issues };

  // Kosaraju's first pass: explicit DFS frames retain linear traversal cost.
  const visited = new Set<string>();
  const finish: string[] = [];
  for (const start of graph.keys()) {
    if (visited.has(start)) continue;
    visited.add(start);
    const stack = [{ id: start, next: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const successors = graph.get(frame.id)!.successors;
      if (frame.next === successors.length) {
        finish.push(frame.id);
        stack.pop();
      } else {
        const successor = successors[frame.next++];
        if (!visited.has(successor)) {
          visited.add(successor);
          stack.push({ id: successor, next: 0 });
        }
      }
    }
  }
  visited.clear();
  for (let cursor = finish.length - 1; cursor >= 0; cursor--) {
    const start = finish[cursor];
    if (visited.has(start)) continue;
    const component: string[] = [];
    const stack = [start];
    visited.add(start);
    while (stack.length) {
      const id = stack.pop()!;
      component.push(id);
      for (const predecessor of graph.get(id)!.predecessors) {
        if (!visited.has(predecessor)) {
          visited.add(predecessor);
          stack.push(predecessor);
        }
      }
    }
    if (component.length === 1 && !graph.get(start)!.predecessors.includes(start)) continue;
    const members = new Set(component);
    // Follow in-component prerequisite links to obtain an actual cycle path.
    const chain: string[] = [];
    const positions = new Map<string, number>();
    let current = start;
    while (!positions.has(current)) {
      positions.set(current, chain.length);
      chain.push(current);
      current = graph.get(current)!.predecessors.find(id => members.has(id))!;
    }
    const cycle = [...chain.slice(positions.get(current)!), current];
    const label = (id: string) => `${graph.get(id)!.task.code || id} (${id})`;
    add(issues, 'graph.cycle', `tasks[${graph.get(current)!.index}].predecessors`,
      `Precedence cycle: ${cycle.map(label).join(' → ')}. Remove or change a predecessor in this cycle. Tasks in this cyclic group: ${component.map(label).join(', ')}.`);
  }
  return { order: [], issues };
}

export function validateTaskGraph(tasks: Task[]): ValidationIssue[] {
  return topologicalTaskOrder(tasks).issues;
}

/** Structural validity includes identity, metadata, references, and the DAG. */
export function validateLineModel(stations: unknown, tasks: unknown): ValidationIssue[] {
  const issues = [...validateJSONValues(stations, 'stations'), ...validateJSONValues(tasks, 'tasks')];
  if (issues.length) return issues;
  if (!Array.isArray(stations)) {
    add(issues, 'shape.array', 'stations', 'stations must be an array.');
  } else {
    stations.forEach((station, index) => {
      const path = `stations[${index}]`;
      if (!isRecord(station)) {
        add(issues, 'shape.object', path, `${path} must be an object.`);
        return;
      }
      for (const key of ['id', 'code', 'name']) checkText(station[key], `${path}.${key}`, issues);
      checkPositive(station.operatorCount, `${path}.operatorCount`, issues, true);
      checkOptionalText(station, 'description', path, issues);
      if (station.maxWorkplaceCapacity !== undefined) {
        checkPositive(station.maxWorkplaceCapacity, `${path}.maxWorkplaceCapacity`, issues, true);
        if (isFiniteNumber(station.maxWorkplaceCapacity) && isFiniteNumber(station.operatorCount)
            && station.operatorCount > station.maxWorkplaceCapacity) {
          add(issues, 'station.capacity', `${path}.operatorCount`,
            `${station.code} has more operators than its maximum workplace capacity. Reduce its workforce or correct the capacity.`);
        }
      }
    });
    checkUnique(stations, 'id', 'stations', issues);
    checkUnique(stations, 'code', 'stations', issues);
  }
  if (!Array.isArray(tasks)) {
    add(issues, 'shape.array', 'tasks', 'tasks must be an array.');
  } else {
    const stationIds = new Set(Array.isArray(stations)
      ? stations.filter(isRecord).map(station => station.id).filter(isText) : []);
    tasks.forEach((task, index) => {
      const path = `tasks[${index}]`;
      if (!isRecord(task)) {
        add(issues, 'shape.object', path, `${path} must be an object.`);
        return;
      }
      for (const key of ['id', 'code', 'name']) checkText(task[key], `${path}.${key}`, issues);
      checkPositive(task.duration, `${path}.duration`, issues);
      checkOptionalText(task, 'description', path, issues);
      if (!['VA', 'NVAR', 'NVA'].includes(task.category as string)) {
        add(issues, 'task.category', `${path}.category`, 'Task category must be VA, NVAR, or NVA.');
      }
      if (!['low', 'moderate', 'high'].includes(task.ergonomics as string)) {
        add(issues, 'task.ergonomics', `${path}.ergonomics`, 'Task ergonomics must be low, moderate, or high.');
      }
      if (task.assignedStationId !== null && !isText(task.assignedStationId)) {
        add(issues, 'shape.station_assignment', `${path}.assignedStationId`, 'Task assignment must be a station ID or null for backlog.');
      } else if (typeof task.assignedStationId === 'string' && !stationIds.has(task.assignedStationId)) {
        add(issues, 'reference.station', `${path}.assignedStationId`,
          `${task.code} references missing station ${task.assignedStationId}. Restore the station or explicitly move the task to backlog.`);
      }
      for (const key of ['requiredSkills', 'toolsAndFixtures']) {
        if (task[key] !== undefined) checkStringList(task[key], `${path}.${key}`, issues);
      }
    });
    checkUnique(tasks, 'id', 'tasks', issues);
    checkUnique(tasks, 'code', 'tasks', issues);
    issues.push(...validateTaskGraph(tasks as Task[]));
  }
  return uniqueIssues(issues);
}

export function validateLineInput(stations: unknown, tasks: unknown, params: unknown): ValidationIssue[] {
  return [...validateLineModel(stations, tasks), ...validateOperatingParameters(params)];
}

/** Validate every scenario before accepting a project; never strip unknown data. */
export function validateProject(value: unknown): ValidationResult<FlowProject> {
  if (!isRecord(value)) {
    return { valid: false, issues: [{ code: 'shape.object', path: '$', message: 'Project must be an object.' }] };
  }
  const issues = validateJSONValues(value, '');
  if (issues.length) return { valid: false, issues };
  for (const key of ['id', 'name']) checkText(value[key], key, issues);
  for (const key of ['partNumber', 'plantLocation']) checkText(value[key], key, issues, true);
  checkDate(value.lastModified, 'lastModified', issues);
  issues.push(...validateLineInput(value.stations, value.tasks, value.operatingParams));
  if (!Array.isArray(value.scenarios)) {
    add(issues, 'shape.array', 'scenarios', 'scenarios must be an array.');
  } else {
    value.scenarios.forEach((scenario, index) => {
      const path = `scenarios[${index}]`;
      if (!isRecord(scenario)) {
        add(issues, 'shape.object', path, `${path} must be an object.`);
        return;
      }
      for (const key of ['id', 'name']) checkText(scenario[key], `${path}.${key}`, issues);
      checkText(scenario.description, `${path}.description`, issues, true);
      checkDate(scenario.createdAt, `${path}.createdAt`, issues);
      issues.push(...validateLineInput(scenario.stations, scenario.tasks, scenario.operatingParams)
        .map(issue => ({ ...issue, path: `${path}.${issue.path}`, message: `${path}: ${issue.message}` })));
    });
    checkUnique(value.scenarios, 'id', 'scenarios', issues);
  }
  if (value.activeScenarioId !== undefined) {
    checkText(value.activeScenarioId, 'activeScenarioId', issues);
    if (isText(value.activeScenarioId) && Array.isArray(value.scenarios)
        && !value.scenarios.some(scenario => isRecord(scenario) && scenario.id === value.activeScenarioId)) {
      add(issues, 'reference.scenario', 'activeScenarioId',
        'activeScenarioId references a missing scenario. Restore the scenario or remove the active scenario reference.');
    }
  }
  const distinct = uniqueIssues(issues);
  return distinct.length
    ? { valid: false, issues: distinct }
    : { valid: true, value: value as unknown as FlowProject, issues: distinct };
}

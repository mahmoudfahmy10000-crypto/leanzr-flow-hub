import test from 'node:test';
import assert from 'node:assert/strict';
import type { FlowProject, OperatingParameters, Scenario, Task, Workstation } from '../types/flowlab.ts';
import { sampleProjects } from './sample-projects.ts';
import {
  topologicalTaskOrder,
  validateLineInput,
  validateLineModel,
  validateOperatingParameters,
  validateProject,
  validateTaskGraph,
} from './project-validation.ts';

const station = (id = 's1'): Workstation => ({ id, code: id, name: id, operatorCount: 1 });
const task = (id = 'a', predecessors: string[] = [], assignedStationId: string | null = 's1'): Task => ({
  id, code: `OP-${id}`, name: id, duration: 10, category: 'VA',
  predecessors, assignedStationId, ergonomics: 'low',
});
const params: OperatingParameters = {
  demandUnitsPerPeriod: 100, demandPeriodDays: 1, shiftsPerDay: 1,
  hoursPerShift: 8, plannedDowntimeMinutesPerShift: 0,
  oeeTargetPercent: 100, targetBufferPercent: 0,
};
const project = (): FlowProject => ({
  id: 'p1', name: 'Project', partNumber: '', plantLocation: '',
  lastModified: '2026-10-17T12:00:00.000Z',
  operatingParams: { ...params }, stations: [station()], tasks: [task()], scenarios: [],
});
const scenario = (): Scenario => ({
  id: 'scenario-1', name: 'Scenario', description: '', createdAt: '2026-10-17T12:00:00Z',
  stations: [station()], tasks: [task()], operatingParams: { ...params },
});

test('all shipped benchmark projects satisfy the shared runtime contract', () => {
  for (const sample of sampleProjects) {
    assert.deepEqual(validateProject(sample).issues, [], sample.name);
  }
});

test('project validation rejects arrays-only, null, and missing project metadata', () => {
  for (const value of [null, [], 1, {}, { stations: [], tasks: [] }]) {
    const result = validateProject(value);
    assert.equal(result.valid, false);
    assert.ok(result.issues.length > 0);
  }
  const value = project();
  value.lastModified = 'invalid date';
  assert.ok(validateProject(value).issues.some(issue => issue.path === 'lastModified'));
});

test('validation preserves the input identity, qualifications, and unknown metadata without mutation', () => {
  const value = {
    ...project(), metadata: { reviewer: 'Mona', annotations: ['review later'] },
    tasks: [{ ...task(), requiredSkills: ['Laser safety'], toolsAndFixtures: ['Laser'], customResource: { machineId: 'M1' } }],
  };
  const before = JSON.stringify(value);
  const result = validateProject(value);
  assert.equal(result.valid, true);
  if (!result.valid) assert.fail('Expected a valid project');
  assert.strictEqual(result.value, value);
  assert.strictEqual(result.value.tasks[0], value.tasks[0]);
  assert.equal(JSON.stringify(value), before);
});

test('overflow literals in nested extension metadata are rejected before JSON can turn them into null', () => {
  const raw = JSON.stringify({ ...project(), metadata: { reading: 'OVERFLOW_LITERAL' } })
    .replace('"OVERFLOW_LITERAL"', '1e400');
  const value = JSON.parse(raw);
  assert.equal(value.metadata.reading, Infinity);
  const result = validateProject(value);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.code === 'number.finite' && issue.path === 'metadata.reading'));
  const taskIssues = validateLineModel([station()], [{ ...task(), metadata: { history: [1, NaN] } }]);
  assert.ok(taskIssues.some(issue => issue.path === 'tasks[0].metadata.history[1]'));
});

test('unsupported metadata values and object instances are rejected instead of silently serialized differently', () => {
  for (const metadata of [
    { value: 1n }, { value: () => 1 }, { value: Symbol('value') },
    { value: new Date('2026-10-17T00:00:00Z') }, { value: new Map([['key', 1]]) },
    { value: new Set([1]) }, { [Symbol('key')]: 'value' },
  ]) {
    const result = validateProject({ ...project(), metadata });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some(issue => issue.code.startsWith('json.unsupported_')));
  }
});

test('undefined optional object properties remain absent fields while undefined or sparse array entries are rejected', () => {
  const value = { ...project(), tasks: [{ ...task(), description: undefined, toolsAndFixtures: undefined }] };
  const result = validateProject(value);
  assert.equal(result.valid, true);
  if (!result.valid) assert.fail('Optional undefined object fields must remain supported');
  assert.strictEqual(result.value, value);
  assert.ok(Object.hasOwn(result.value.tasks[0], 'description'));
  for (const history of [[1, undefined], Array(2)]) {
    const invalid = validateProject({ ...project(), metadata: { history } });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.issues.some(issue => issue.code === 'json.unsupported_value'));
  }
});

test('cyclic metadata fails with an actionable path while shared acyclic object references remain valid', () => {
  const shared = { machine: 'M1', readings: [1, 2, 3] };
  const value = { ...project(), metadata: { first: shared, second: shared } };
  const valid = validateProject(value);
  assert.equal(valid.valid, true);
  if (!valid.valid) assert.fail('Shared references do not form a data cycle');
  assert.strictEqual(valid.value, value);
  const circular: Record<string, unknown> = { child: { valid: true } };
  (circular.child as Record<string, unknown>).parent = circular;
  const invalid = validateProject({ ...project(), metadata: circular });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.some(issue => issue.code === 'json.cycle'
    && issue.path === 'metadata.child.parent' && issue.message.includes('metadata')));
});

test('deep extension metadata is validated iteratively without recursive traversal', () => {
  const metadata: Record<string, unknown> = {};
  let current = metadata;
  for (let index = 0; index < 20_000; index++) {
    const next: Record<string, unknown> = {};
    current.child = next;
    current = next;
  }
  current.reading = 1;
  assert.equal(validateProject({ ...project(), metadata }).valid, true);
  current.reading = Infinity;
  const invalid = validateProject({ ...project(), metadata });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.issues[0].code, 'number.finite');
});

test('accessors are rejected without invoking them, including array elements', () => {
  let getterCalls = 0;
  const metadata = Object.defineProperty({}, 'value', { enumerable: true, get() { getterCalls++; throw new Error('Getter must not execute'); } });
  const array = [1];
  Object.defineProperty(array, '0', { enumerable: true, get() { getterCalls++; throw new Error('Array getter must not execute'); } });
  for (const value of [{ ...project(), metadata }, { ...project(), metadata: array }]) {
    const result = validateProject(value);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some(issue => issue.code === 'json.unsupported_property'));
  }
  assert.equal(getterCalls, 0);
});

test('extension fields attached to arrays are rejected because JSON would drop them', () => {
  const history = [1, 2] as number[] & { note?: string };
  history.note = 'Preserve this note';
  const result = validateProject({ ...project(), metadata: { history } });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.path === 'metadata.history.note'));
});

test('finite positive task durations and integral positive workforce are required', () => {
  for (const duration of [NaN, Infinity, -Infinity, 0, -1, '10']) {
    const issues = validateLineModel([station()], [{ ...task(), duration }]);
    assert.ok(issues.some(issue => issue.path === 'tasks[0].duration'), String(duration));
  }
  for (const operatorCount of [NaN, Infinity, 0, -1, 1.5, '2', Number.MAX_SAFE_INTEGER + 1]) {
    const issues = validateLineModel([{ ...station(), operatorCount }], [task()]);
    assert.ok(issues.some(issue => issue.path === 'stations[0].operatorCount'), String(operatorCount));
  }
  assert.deepEqual(validateLineModel([{ ...station(), operatorCount: 2 }], [task()]), []);
});

test('maximum workplace capacity is integral and cannot be below assigned workforce', () => {
  assert.ok(validateLineModel([{ ...station(), maxWorkplaceCapacity: 1.5 }], [task()])
    .some(issue => issue.path === 'stations[0].maxWorkplaceCapacity'));
  assert.ok(validateLineModel([{ ...station(), operatorCount: 2, maxWorkplaceCapacity: 1 }], [task()])
    .some(issue => issue.code === 'station.capacity'));
});

test('task and station identities are unique in their scopes; codes compare case-insensitively', () => {
  const issues = validateLineModel(
    [station(), { ...station(), code: ' S1 ' }],
    [task(), { ...task(), code: 'op-A' }],
  );
  for (const path of ['stations[1].id', 'stations[1].code', 'tasks[1].id', 'tasks[1].code']) {
    assert.ok(issues.some(issue => issue.path === path), path);
  }
  assert.ok(validateLineModel([{ ...station(), id: 1 }], [])
    .some(issue => issue.path === 'stations[0].id'));
});

test('missing assignment and predecessor references are actionable errors, never silently removed', () => {
  const value = task('a', ['not-present'], 'missing-station');
  const before = JSON.stringify(value);
  const issues = validateLineModel([station()], [value]);
  assert.ok(issues.some(issue => issue.code === 'reference.station' && issue.message.includes('missing-station')));
  assert.ok(issues.some(issue => issue.code === 'graph.missing_predecessor' && issue.message.includes('not-present')));
  assert.equal(JSON.stringify(value), before);
});

test('known task metadata, categories, and ergonomics are runtime validated', () => {
  const issues = validateLineModel([station()], [{
    ...task(), category: 'wrong', ergonomics: 'unknown', description: 3,
    requiredSkills: 'Laser safety', toolsAndFixtures: ['Laser', 3],
  }]);
  for (const path of [
    'tasks[0].category', 'tasks[0].ergonomics', 'tasks[0].description',
    'tasks[0].requiredSkills', 'tasks[0].toolsAndFixtures[1]',
  ]) assert.ok(issues.some(issue => issue.path === path), path);
});

test('DAG validation identifies direct, indirect, and self cycles without a partial order', () => {
  for (const tasks of [
    [task('a', ['b']), task('b', ['a'])],
    [task('a', ['c']), task('b', ['a']), task('c', ['b'])],
    [task('a', ['a'])],
  ]) {
    const result = topologicalTaskOrder(tasks);
    assert.deepEqual(result.order, []);
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0].code, 'graph.cycle');
    assert.match(result.issues[0].message, /Precedence cycle:.*OP-a.*→/);
    assert.match(result.issues[0].message, /Remove or change a predecessor/);
  }
});

test('cycle diagnostics identify each cyclic group and do not call blocked downstream tasks cyclic', () => {
  const issues = validateTaskGraph([
    task('a', ['b']), task('b', ['a']), task('downstream', ['b']),
    task('c', ['d']), task('d', ['c']), task('root'),
  ]);
  assert.equal(issues.length, 2);
  assert.ok(issues.every(issue => issue.code === 'graph.cycle'));
  assert.ok(issues.every(issue => !issue.message.includes('downstream')));
  assert.ok(issues.some(issue => issue.message.includes('OP-a') && issue.message.includes('OP-b')));
  assert.ok(issues.some(issue => issue.message.includes('OP-c') && issue.message.includes('OP-d')));
});

test('topological ordering is deterministic for disconnected DAGs and preserves each input object', () => {
  const tasks = [task('d', ['b', 'c']), task('c', ['a']), task('b', ['a']), task('a'), task('free')];
  const before = JSON.stringify(tasks);
  const first = topologicalTaskOrder(tasks);
  const second = topologicalTaskOrder(tasks);
  assert.deepEqual(first.issues, []);
  assert.deepEqual(second.order, first.order);
  const indices = new Map(first.order.map((entry, index) => [entry.id, index]));
  for (const entry of tasks) {
    assert.strictEqual(first.order.find(result => result.id === entry.id), entry);
    for (const predecessor of entry.predecessors) assert.ok(indices.get(predecessor)! < indices.get(entry.id)!);
  }
  assert.equal(first.order.length, tasks.length);
  assert.equal(JSON.stringify(tasks), before);
});

test('a 20,000-task deep DAG and deep cycle validate without recursive stack overflow', () => {
  const tasks = Array.from({ length: 20_000 }, (_, index) => task(
    `t${index}`, index ? [`t${index - 1}`] : [], null,
  ));
  assert.equal(topologicalTaskOrder(tasks).order.length, tasks.length);
  tasks[0] = { ...tasks[0], predecessors: [tasks[tasks.length - 1].id] };
  const cyclic = topologicalTaskOrder(tasks);
  assert.deepEqual(cyclic.order, []);
  assert.equal(cyclic.issues[0].code, 'graph.cycle');
});

test('duplicate prerequisite entries and malformed graph inputs fail without throwing', () => {
  assert.ok(validateTaskGraph([task('a'), task('b', ['a', 'a'])])
    .some(issue => issue.code === 'graph.duplicate_predecessor'));
  for (const value of [null, [{}], [null], [{ id: 'a', predecessors: 'bad' }]]) {
    const result = topologicalTaskOrder(value as Task[]);
    assert.deepEqual(result.order, []);
    assert.ok(result.issues.length);
  }
});

test('schedule ranges reject impossible daily hours, nonfinite values, and zero productive time', () => {
  for (const [key, value] of Object.entries({
    demandUnitsPerPeriod: 0, demandPeriodDays: Infinity, shiftsPerDay: 1.5,
    hoursPerShift: NaN, plannedDowntimeMinutesPerShift: -1,
    oeeTargetPercent: 101, targetBufferPercent: 100,
  })) {
    assert.ok(validateOperatingParameters({ ...params, [key]: value })
      .some(issue => issue.path === `operatingParams.${key}`), key);
  }
  assert.ok(validateOperatingParameters({ ...params, shiftsPerDay: 4, hoursPerShift: 8 })
    .some(issue => issue.code === 'schedule.overlap'));
  assert.ok(validateOperatingParameters({ ...params, plannedDowntimeMinutesPerShift: 480 })
    .some(issue => issue.code === 'schedule.downtime'));
  assert.deepEqual(validateOperatingParameters({ ...params, shiftsPerDay: 3, hoursPerShift: 8 }), []);
  assert.deepEqual(validateOperatingParameters(params), []);
});

test('every numeric operating field must be a finite number without coercion', () => {
  for (const key of Object.keys(params)) {
    for (const value of [NaN, Infinity, -Infinity, '1', null]) {
      assert.ok(validateOperatingParameters({ ...params, [key]: value })
        .some(issue => issue.path === `operatingParams.${key}`), `${key} = ${String(value)}`);
    }
  }
});

test('all scenario scopes are validated while reused task and station IDs across snapshots remain valid', () => {
  const value = project();
  value.scenarios = [scenario()];
  value.activeScenarioId = value.scenarios[0].id;
  assert.equal(validateProject(value).valid, true);
  value.scenarios[0].tasks[0].requiredSkills = [5] as unknown as string[];
  value.scenarios[0].operatingParams.demandPeriodDays = 0;
  const invalid = validateProject(value);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.some(issue => issue.path === 'scenarios[0].tasks[0].requiredSkills[0]'));
  assert.ok(invalid.issues.some(issue => issue.path === 'scenarios[0].operatingParams.demandPeriodDays'));
});

test('scenario metadata, scenario identity, and active scenario references are validated', () => {
  const value = project();
  value.scenarios = [scenario(), { ...scenario(), createdAt: 'not-a-date' }];
  value.activeScenarioId = 'missing';
  const issues = validateProject(value).issues;
  assert.ok(issues.some(issue => issue.path === 'scenarios[1].id'));
  assert.ok(issues.some(issue => issue.path === 'scenarios[1].createdAt'));
  assert.ok(issues.some(issue => issue.code === 'reference.scenario'));
});

test('empty and unassigned lines, multi-operator settings, and station-order violations are structurally valid', () => {
  assert.deepEqual(validateLineInput([], [], params), []);
  assert.deepEqual(validateLineModel([], [task('backlog', [], null)]), []);
  assert.deepEqual(validateLineModel([{ ...station(), operatorCount: 2 }], [task()]), []);
  assert.deepEqual(validateLineModel([station('s1'), station('s2')], [
    task('a', [], 's2'), task('b', ['a'], 's1'),
  ]), []);
});

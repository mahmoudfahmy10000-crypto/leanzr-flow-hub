import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTaskCandidate, nextOperationCode } from './TaskModal.tsx';
import type { Task } from '../types/flowlab.ts';

const task: Task = {
  id: 'task-original',
  code: 'OP-010',
  name: 'Machine operation',
  duration: 40,
  category: 'VA',
  predecessors: [],
  assignedStationId: 'station-one',
  ergonomics: 'low',
  requiredSkills: ['laser-safety', 'quality-inspection'],
  toolsAndFixtures: ['laser fixture'],
};

test('task edits preserve qualifications and unexposed extension metadata', () => {
  const original = { ...task, resourceMetadata: { machineId: 'laser-one', fixedCycle: true } };
  const { id: _id, requiredSkills: _skills, ...editableFields } = task;
  const updated = buildTaskCandidate(original, { ...editableFields, name: 'Reviewed operation' }, [original]);
  assert.equal(updated.id, original.id);
  assert.equal(updated.name, 'Reviewed operation');
  assert.deepEqual(updated.requiredSkills, ['laser-safety', 'quality-inspection']);
  assert.deepEqual((updated as typeof original).resourceMetadata, original.resourceMetadata);
  assert.equal(original.name, 'Machine operation');
});

test('new operation code fills unused codes after a deletion without duplicates', () => {
  const existing = [task, { ...task, id: 'task-three', code: 'OP-030' }];
  assert.equal(nextOperationCode(existing), 'OP-020');
  assert.equal(nextOperationCode([...existing, { ...task, id: 'task-two', code: 'OP-020' }]), 'OP-040');
  assert.equal(nextOperationCode([{ ...task, code: ' op-010 ' }]), 'OP-020');
});

test('new tasks receive distinct IDs without changing existing task objects', () => {
  const { id: _id, ...fields } = task;
  const first = buildTaskCandidate(null, fields, [task]);
  const second = buildTaskCandidate(null, fields, [task, first]);
  assert.notEqual(first.id, task.id);
  assert.notEqual(first.id, second.id);
  assert.equal(task.id, 'task-original');
});

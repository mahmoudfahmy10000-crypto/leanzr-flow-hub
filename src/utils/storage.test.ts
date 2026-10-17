import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createScenarioSnapshot, loadProtectedRaw, loadRecoveryProject, loadSavedProjectsList,
  loadWorkspace, recoverWorkspace, saveActiveProject, saveProjectsList,
} from './storage.ts';
import { evBatteryModuleProject, sampleProjects } from './sample-projects.ts';
import type { FlowProject } from '../types/flowlab.ts';

const ACTIVE = 'leanzr_flowlab_active_project';
const CATALOG = 'leanzr_flowlab_saved_projects';
const PREVIOUS = 'leanzr_flowlab_previous_project';
const PROTECTED = 'leanzr_flowlab_protected_recovery_data';

class MemoryStorage implements Storage {
  data = new Map<string, string>();
  writes: { key: string; value: string }[] = [];
  failWrite: ((key: string, value: string) => boolean) | undefined;
  failRead = false;
  get length() { return this.data.size; }
  getItem(key: string) {
    if (this.failRead) throw new Error('Storage access denied');
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrite?.(key, value)) throw new DOMException('Browser quota exceeded', 'QuotaExceededError');
    this.data.set(key, value);
    this.writes.push({ key, value });
  }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
}
let storage: MemoryStorage;
const project = (overrides: Partial<FlowProject> = {}): FlowProject => ({ ...structuredClone(evBatteryModuleProject), ...overrides });
beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
});

function seed(value = project()) {
  storage.data.set(ACTIVE, JSON.stringify(value));
  storage.data.set(CATALOG, JSON.stringify([value]));
  return value;
}

test('loading a fresh workspace returns independent seed data without writing to storage', () => {
  const loaded = loadWorkspace();
  assert.equal(loaded.warning, undefined);
  assert.equal(loaded.protectedRaw, undefined);
  assert.equal(loaded.project.id, evBatteryModuleProject.id);
  loaded.project.tasks[0].name = 'Changed locally';
  assert.notEqual(loadWorkspace().project.tasks[0].name, 'Changed locally');
  assert.equal(storage.writes.length, 0);
});

test('corrupted or structurally invalid persisted data is preserved and ordinary saves cannot overwrite it', () => {
  for (const raw of ['{broken', '{"id":"broken","tasks":[],"stations":[]}']) {
    storage.data.set(ACTIVE, raw);
    const loaded = loadWorkspace();
    assert.equal(loaded.protectedRaw, raw);
    assert.match(loaded.warning!, /invalid.*preserved/i);
    assert.equal(loaded.project.id, evBatteryModuleProject.id);
    assert.equal(saveActiveProject(project()).success, false);
    assert.equal(storage.getItem(ACTIVE), raw);
    assert.equal(loadProtectedRaw(), raw);
  }
  assert.equal(storage.writes.length, 0);
});

test('an invalid catalog pauses persistence and is never replaced by an ordinary save', () => {
  const original = seed();
  storage.data.set(CATALOG, '[{"invalid":true}]');
  const loaded = loadWorkspace();
  assert.deepEqual(loaded.project, original);
  assert.equal(loaded.protectedRaw, '[{"invalid":true}]');
  assert.match(loaded.warning!, /catalog is invalid/);
  assert.equal(saveActiveProject(project({ name: 'New' })).success, false);
  assert.equal(saveProjectsList([project()]).success, false);
  assert.equal(storage.getItem(CATALOG), '[{"invalid":true}]');
  assert.deepEqual(JSON.parse(storage.getItem(ACTIVE)!), original);
});

test('saving validates first, never mutates the input, and preserves a recoverable previous revision', () => {
  const original = seed(project({ name: 'Previous plan' }));
  const next = project({ name: 'Revised plan', lastModified: '2020-01-01T00:00:00.000Z' });
  const before = structuredClone(next);
  assert.deepEqual(saveActiveProject(next), { success: true });
  assert.deepEqual(next, before);
  assert.deepEqual(loadRecoveryProject(), original);
  assert.equal(JSON.parse(storage.getItem(ACTIVE)!).name, 'Revised plan');
  assert.notEqual(JSON.parse(storage.getItem(ACTIVE)!).lastModified, before.lastModified);
  const archiveWrite = storage.writes.findIndex(write => write.key === PREVIOUS);
  const activeWrite = storage.writes.findIndex(write => write.key === ACTIVE);
  assert.ok(archiveWrite >= 0 && archiveWrite < activeWrite, 'Known-good revision must be archived before replacement');
  const invalid = project();
  invalid.tasks[0].duration = Infinity;
  const priorRaw = storage.getItem(ACTIVE);
  assert.equal(saveActiveProject(invalid).success, false);
  assert.equal(storage.getItem(ACTIVE), priorRaw);
});

test('switching projects retains customized work for every project ID in the saved catalog', () => {
  const first = project({ name: 'User EV plan' });
  first.stations[0].name = 'Custom work cell';
  assert.equal(saveActiveProject(first).success, true);
  const second = structuredClone(sampleProjects.find(item => item.id !== first.id)!);
  second.tasks[0].description = 'Preserved second-project note';
  assert.equal(saveActiveProject(second).success, true);
  const catalog = loadSavedProjectsList();
  assert.equal(catalog.find(item => item.id === first.id)?.stations[0].name, 'Custom work cell');
  assert.equal(catalog.find(item => item.id === second.id)?.tasks[0].description, 'Preserved second-project note');
  assert.equal(new Set(catalog.map(item => item.id)).size, catalog.length);
  const restored = catalog.find(item => item.id === first.id)!;
  assert.equal(saveActiveProject(restored).success, true);
  assert.equal(loadWorkspace().project.stations[0].name, 'Custom work cell');
});

test('quota failures during recovery, catalog, or active writes leave the original active project and roll back auxiliary writes', () => {
  for (const failingKey of [PREVIOUS, CATALOG, ACTIVE]) {
    storage = new MemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    seed(project({ name: 'Original' }));
    storage.data.set(PREVIOUS, JSON.stringify(project({ name: 'Earlier backup' })));
    const before = new Map(storage.data);
    let failed = false;
    storage.failWrite = key => key === failingKey && !failed && (failed = true);
    const candidate = project({ name: 'Unsaved candidate' });
    const candidateBefore = structuredClone(candidate);
    const result = saveActiveProject(candidate);
    assert.equal(result.success, false);
    if (!result.success) assert.match(result.error, /not saved.*quota/i);
    assert.deepEqual(storage.data, before);
    assert.deepEqual(candidate, candidateBefore);
  }
});

test('project-list updates preserve existing projects, reject duplicates, and report write errors', () => {
  const first = seed(project({ name: 'Saved first project' }));
  const second = structuredClone(sampleProjects.find(item => item.id !== first.id)!);
  assert.deepEqual(saveProjectsList([second]), { success: true });
  assert.equal(JSON.parse(storage.getItem(CATALOG)!).length, 2);
  const before = storage.getItem(CATALOG);
  assert.equal(saveProjectsList([first, first]).success, false);
  assert.equal(storage.getItem(CATALOG), before);
  storage.failWrite = key => key === CATALOG;
  const result = saveProjectsList([project({ id: 'another' })]);
  assert.equal(result.success, false);
  if (!result.success) assert.match(result.error, /not saved/);
  assert.equal(storage.getItem(CATALOG), before);
});

test('explicit recovery verifies a protected copy before replacing corruption and keeps previous recovery records', () => {
  const activeRaw = '{broken original payload';
  const catalogRaw = '[{"invalid":true}]';
  storage.data.set(ACTIVE, activeRaw);
  storage.data.set(CATALOG, catalogRaw);
  storage.data.set(PROTECTED, 'An earlier original payload');
  assert.equal(recoverWorkspace(project()).success, true);
  const backup = JSON.parse(loadProtectedRaw()!);
  assert.equal(backup.activeProjectRaw, activeRaw);
  assert.equal(backup.savedProjectsRaw, catalogRaw);
  assert.equal(backup.previousRecoveryRaw, 'An earlier original payload');
  assert.ok(storage.writes.findIndex(write => write.key === PROTECTED) < storage.writes.findIndex(write => write.key === ACTIVE));
  assert.equal(loadWorkspace().protectedRaw, undefined);
  assert.equal(saveActiveProject(project({ name: 'Continued safely' })).success, true);
});

test('a recovery backup failure cannot replace original corrupt active data', () => {
  const original = '{broken';
  storage.data.set(ACTIVE, original);
  storage.failWrite = key => key === PROTECTED;
  const result = recoverWorkspace(project());
  assert.equal(result.success, false);
  assert.equal(storage.getItem(ACTIVE), original);
  assert.equal(storage.getItem(CATALOG), null);
});

test('recovery refuses replacement when the protected backup cannot be read back unchanged', () => {
  storage.data.set(ACTIVE, '{broken');
  const ordinarySet = storage.setItem.bind(storage);
  storage.setItem = (key, value) => ordinarySet(key, key === PROTECTED ? 'truncated' : value);
  const result = recoverWorkspace(project());
  assert.equal(result.success, false);
  if (!result.success) assert.match(result.error, /backup could not be verified/);
  assert.equal(storage.getItem(ACTIVE), '{broken');
});

test('denied storage access produces an actionable warning and failure rather than success', () => {
  storage.failRead = true;
  const loaded = loadWorkspace();
  assert.match(loaded.warning!, /storage is unavailable/i);
  const result = saveActiveProject(project());
  assert.equal(result.success, false);
  if (!result.success) assert.match(result.error, /Export your in-memory project/);
});

test('snapshots have collision-resistant identities and do not share mutable model references', () => {
  const source = project();
  const first = createScenarioSnapshot(source, 'One', 'Snapshot');
  const second = createScenarioSnapshot(source, 'Two', 'Snapshot');
  assert.notEqual(first.id, second.id);
  first.tasks[0].requiredSkills!.push('Local-only qualification');
  first.stations[0].name = 'Changed snapshot cell';
  first.operatingParams.demandUnitsPerPeriod = 999;
  assert.notEqual(source.stations[0].name, first.stations[0].name);
  assert.notEqual(source.operatingParams.demandUnitsPerPeriod, 999);
  assert.ok(!source.tasks[0].requiredSkills!.includes('Local-only qualification'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { exportTasksToCSV, parseProjectJSON, parseTasksCSV } from './export-import.ts';
import { evBatteryModuleProject } from './sample-projects.ts';
import type { Task, Workstation } from '../types/flowlab.ts';

const stations: Workstation[] = [{ id: 's1', code: 'ST-01', name: 'Assembly', operatorCount: 1 }];
const header = 'Code,Name,Duration_s,Category,Station_Code,Predecessors,Ergonomics,Description';
const task = (overrides: Partial<Task> = {}): Task => ({ id: 'a', code: 'A', name: 'Assembly', duration: 10, category: 'VA', assignedStationId: 's1', predecessors: [], ergonomics: 'low', ...overrides });

function rejectsCSV(text: string, pattern: RegExp, targetStations = stations): void {
  const result = parseTasksCSV(text, targetStations);
  assert.deepEqual(result.tasks, [], 'No subset of an invalid candidate may be committed');
  assert.ok(result.errors.length > 0);
  assert.match(result.errors.join('\n'), pattern);
}

test('CSV round trip preserves Unicode, commas, quotes, CR/LF, significant whitespace, routing, and qualification metadata', () => {
  const source = [
    task({ name: '  Setup, "Cairo" القاهرة  ', description: 'First instruction\r\nSecond instruction\nThird', requiredSkills: ['ESD, safety', 'Laser; L1'], toolsAndFixtures: ['Fixture "A"', 'Caliper'] }),
    task({ id: 'b', code: 'B', name: 'Finish', duration: 12.5, predecessors: ['a'], assignedStationId: null, requiredSkills: [], toolsAndFixtures: [] }),
  ];
  const result = parseTasksCSV(exportTasksToCSV(source, stations), stations);
  assert.deepEqual(result.errors, []);
  assert.equal(result.tasks.length, source.length);
  for (let index = 0; index < source.length; index++) {
    const { id: ignoredSourceId, predecessors: ignoredSourcePreds, ...expected } = source[index];
    const { id: ignoredResultId, predecessors: ignoredResultPreds, ...actual } = result.tasks[index];
    // An absent optional description and the CSV template's empty description have the same meaning.
    assert.deepEqual(actual, { description: '', ...expected });
  }
  assert.deepEqual(result.tasks[1].predecessors, [result.tasks[0].id]);
  assert.notEqual(result.tasks[0].id, result.tasks[1].id);
});

test('CSV rejects a partially valid candidate atomically and reports every malformed row', () => {
  rejectsCSV(`${header}\nA,Good,10,VA,ST-01,,low,\nB,Bad,-1,VA,ST-01,,low,\nC,Broken`, /Row 3:.*Duration_s[\s\S]*Row 4:.*columns/);
});

test('CSV requires complete finite decimal numbers instead of parseFloat prefixes', () => {
  for (const duration of ['Infinity', '-Infinity', 'NaN', '1e999', '10seconds', '0x10', '', '0', '-2']) {
    rejectsCSV(`${header}\nA,Assembly,${duration},VA,ST-01,,low,`, /finite positive/);
  }
  const valid = parseTasksCSV(`${header}\nA,Assembly,1.25e2,VA,ST-01,,low,`, stations);
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.tasks[0].duration, 125);
});

test('CSV resolves exact headers without confusing Station_Code with Code and rejects ambiguous or unknown columns', () => {
  const result = parseTasksCSV('Station_Code,Name,Code,Duration_s\nST-01,Assembly,A,10', stations);
  assert.deepEqual(result.errors, []);
  assert.equal(result.tasks[0].code, 'A');
  assert.equal(result.tasks[0].assignedStationId, 's1');
  rejectsCSV('Code,Name,Duration_s,Duration\nA,Assembly,10,10', /Duplicate column/);
  rejectsCSV('Operation_Code,Name,Duration_s\nA,Assembly,10', /Unknown column[\s\S]*Required column "Code"/);
  rejectsCSV('Code,Name,Duration_s,__proto__\nA,Assembly,10,ignored', /Unknown column/);
});

test('CSV rejects duplicate codes, unresolved dependencies, unknown stations, and invalid enums', () => {
  rejectsCSV(`${header}\nA,One,10,VA,ST-01,,low,\na,Two,10,VA,ST-01,,low,`, /Duplicate task code/);
  rejectsCSV(`${header}\nA,One,10,VA,ST-01,MISSING,low,`, /Unknown predecessor code "MISSING"/);
  rejectsCSV(`${header}\nA,One,10,VA,ST-99,,low,`, /Unknown station code/);
  rejectsCSV(`${header}\nA,One,10,VALUE,ST-01,,low,`, /Category must be/);
  rejectsCSV(`${header}\nA,One,10,VA,ST-01,,dangerous,`, /Ergonomics must be/);
  rejectsCSV(`${header}\nA,One,10,VA,ST-01,,low,`, /[Dd]uplicate/, [...stations, { ...stations[0], id: 's2' }]);
});

test('CSV rejects self-dependencies and multi-task cycles before returning tasks', () => {
  rejectsCSV(`${header}\nA,One,10,VA,ST-01,A,low,`, /[Cc]ycle|[Ss]elf/);
  rejectsCSV(`${header}\nA,One,10,VA,ST-01,B,low,\nB,Two,10,VA,ST-01,A,low,`, /[Cc]ycle/);
});

test('CSV rejects malformed quoting, extra/blank records, missing cells, and malformed metadata', () => {
  rejectsCSV(`${header}\nA,"Unfinished,10,VA,ST-01,,low,`, /Unterminated/);
  rejectsCSV(`${header}\nA,"Closed"junk,10,VA,ST-01,,low,`, /Invalid CSV quoting/);
  rejectsCSV(`${header}\nA,Not"Quoted,10,VA,ST-01,,low,`, /Invalid CSV quoting/);
  rejectsCSV(`${header}\nA,Assembly,10,VA,ST-01,,low,\n\n`, /columns/);
  rejectsCSV(`${header},Required_Skills\nA,Assembly,10,VA,ST-01,,low,,not-an-array`, /JSON array/);
});

test('JSON validates complete projects before import and preserves extra project/task metadata', () => {
  assert.equal(parseProjectJSON('{"tasks":[],"stations":[]}').valid, false);
  assert.equal(parseProjectJSON('{bad').valid, false);
  const project = structuredClone(evBatteryModuleProject) as typeof evBatteryModuleProject & { customerNotes: object };
  project.customerNotes = { revision: 4 };
  Object.assign(project.tasks[0], { customQualification: 'retained' });
  const result = parseProjectJSON(JSON.stringify(project));
  assert.equal(result.valid, true);
  if (result.valid) assert.deepEqual(result.value, project);
  project.tasks[0].duration = Infinity;
  assert.equal(parseProjectJSON(JSON.stringify(project)).valid, false);
});

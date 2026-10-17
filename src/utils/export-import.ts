/** File imports are parsed and validated completely before a caller can commit them. */
import type { Task, Workstation, TaskCategory, ErgonomicRating } from '../types/flowlab.ts';
import { validateLineModel, validateProject } from './project-validation.ts';

const CSV_HEADERS = ['Code', 'Name', 'Duration_s', 'Category', 'Station_Code', 'Predecessors', 'Ergonomics', 'Description', 'Required_Skills', 'Tools_And_Fixtures'];

const escapeCSV = (value: string | number | undefined): string => {
  const text = String(value ?? '');
  return /[,"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function exportTasksToCSV(tasks: Task[], stations: Workstation[]): string {
  const stationMap = new Map(stations.map(station => [station.id, station.code]));
  const taskMap = new Map(tasks.map(task => [task.id, task.code]));
  const rows = tasks.map(task => [
    task.code,
    task.name,
    task.duration,
    task.category,
    task.assignedStationId ? (stationMap.get(task.assignedStationId) ?? task.assignedStationId) : 'UNASSIGNED',
    task.predecessors.map(id => taskMap.get(id) ?? id).join(';'),
    task.ergonomics,
    task.description,
    task.requiredSkills === undefined ? '' : JSON.stringify(task.requiredSkills),
    task.toolsAndFixtures === undefined ? '' : JSON.stringify(task.toolsAndFixtures),
  ].map(escapeCSV).join(','));
  return [CSV_HEADERS.join(','), ...rows].join('\r\n');
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function parseProjectJSON(text: string): ReturnType<typeof validateProject> {
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    return { valid: false, issues: [{ code: 'json.parse', path: '$', message: 'The file is not valid JSON. Correct its syntax before importing.' }] };
  }
  return validateProject(candidate);
}

interface CSVRecord { fields: string[]; line: number }

/** Parse records, rather than physical lines, so quoted CR/LF and escaped quotes survive. */
function parseCSVRecords(text: string): { records: CSVRecord[]; errors: string[] } {
  const records: CSVRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let state: 'start' | 'unquoted' | 'quoted' | 'closed' = 'start';
  let line = 1;
  let recordLine = 1;
  const source = text.replace(/^\uFEFF/, '');
  const finishField = () => { fields.push(field); field = ''; state = 'start'; };
  const finishRecord = () => { finishField(); records.push({ fields, line: recordLine }); fields = []; };

  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (state === 'quoted') {
      if (char === '"') {
        if (source[index + 1] === '"') { field += '"'; index++; }
        else state = 'closed';
      } else {
        field += char;
        if (char === '\n' || (char === '\r' && source[index + 1] !== '\n')) line++;
      }
      continue;
    }
    if (char === ',') { finishField(); continue; }
    if (char === '\n' || char === '\r') {
      finishRecord();
      if (char === '\r' && source[index + 1] === '\n') index++;
      recordLine = ++line;
      continue;
    }
    if (char === '"' && state === 'start') { state = 'quoted'; continue; }
    if (char === '"' || state === 'closed') {
      return { records: [], errors: [`Row ${line}: Invalid CSV quoting. Quote the entire field and escape embedded quotes as "".`] };
    }
    field += char;
    state = 'unquoted';
  }
  if (state === 'quoted') return { records: [], errors: [`Row ${recordLine}: Unterminated quoted CSV field.`] };
  if (field.length || fields.length || state !== 'start') finishRecord();
  return { records, errors: [] };
}

type CSVColumn = 'code' | 'name' | 'duration' | 'category' | 'station' | 'predecessors' | 'ergonomics' | 'description' | 'skills' | 'tools';
const HEADER_FIELDS: Record<string, CSVColumn> = {
  code: 'code', name: 'name', duration_s: 'duration', duration: 'duration',
  category: 'category', station_code: 'station', station: 'station', predecessors: 'predecessors',
  ergonomics: 'ergonomics', description: 'description', required_skills: 'skills', skills: 'skills',
  tools_and_fixtures: 'tools', tools: 'tools',
};
let importSequence = 0;
const newTaskId = (): string => `imported-task-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${++importSequence}-${Math.random().toString(36).slice(2)}`}`;

export function parseTasksCSV(csvText: string, existingStations: Workstation[]): { tasks: Task[]; errors: string[] } {
  const parsed = parseCSVRecords(csvText);
  if (parsed.errors.length) return { tasks: [], errors: parsed.errors };
  if (parsed.records.length < 2) return { tasks: [], errors: ['CSV file is empty or missing data rows.'] };

  const errors: string[] = [];
  const columns = new Map<CSVColumn, number>();
  parsed.records[0].fields.forEach((header, index) => {
    const key = header.trim().toLowerCase();
    const column = Object.hasOwn(HEADER_FIELDS, key) ? HEADER_FIELDS[key] : undefined;
    if (!column) errors.push(`Header column ${index + 1}: Unknown column "${header}". Use the exported CSV template.`);
    else if (columns.has(column)) errors.push(`Header column ${index + 1}: Duplicate column "${header}".`);
    else columns.set(column, index);
  });
  for (const [field, label] of [['code', 'Code'], ['name', 'Name'], ['duration', 'Duration_s']] as const) {
    if (!columns.has(field)) errors.push(`Required column "${label}" was not found in CSV header.`);
  }
  const stationIssues = validateLineModel(existingStations, []);
  errors.push(...stationIssues.map(issue => `${issue.path}: ${issue.message}`));
  if (errors.length) return { tasks: [], errors };

  const stationMap = new Map(existingStations.map(station => [station.code.trim().toUpperCase(), station.id]));
  const codeMap = new Map<string, string>();
  const tasks: Task[] = [];
  const pendingPredecessors: { task: Task; text: string; line: number }[] = [];

  for (const { fields, line } of parsed.records.slice(1)) {
    if (fields.length !== parsed.records[0].fields.length) {
      errors.push(`Row ${line}: Expected ${parsed.records[0].fields.length} columns, received ${fields.length}.`);
      continue;
    }
    const get = (column: CSVColumn) => columns.has(column) ? fields[columns.get(column)!] : '';
    const code = get('code').trim();
    const name = get('name');
    const durationText = get('duration').trim();
    const duration = Number(durationText);
    if (!code) errors.push(`Row ${line}: Code must not be empty.`);
    if (!name.trim()) errors.push(`Row ${line}: Name must not be empty.`);
    if (!/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(durationText) || !Number.isFinite(duration) || duration <= 0) {
      errors.push(`Row ${line}: Duration_s must be a finite positive number; received "${durationText}".`);
    }
    const normalizedCode = code.toUpperCase();
    if (codeMap.has(normalizedCode)) errors.push(`Row ${line}: Duplicate task code "${code}".`);
    const categoryText = get('category').trim().toUpperCase() || 'VA';
    if (!['VA', 'NVAR', 'NVA'].includes(categoryText)) errors.push(`Row ${line}: Category must be VA, NVAR, or NVA.`);
    const ergonomicsText = get('ergonomics').trim().toLowerCase() || 'low';
    if (!['low', 'moderate', 'high'].includes(ergonomicsText)) errors.push(`Row ${line}: Ergonomics must be low, moderate, or high.`);
    const stationCode = get('station').trim().toUpperCase();
    let assignedStationId: string | null = null;
    if (stationCode && stationCode !== 'UNASSIGNED') {
      if (!stationMap.has(stationCode)) errors.push(`Row ${line}: Unknown station code "${get('station')}". Add the station or use UNASSIGNED.`);
      else assignedStationId = stationMap.get(stationCode)!;
    }
    const parseList = (column: 'skills' | 'tools'): string[] | undefined => {
      const value = get(column);
      if (!value.trim()) return undefined;
      try {
        const list: unknown = JSON.parse(value);
        if (Array.isArray(list) && list.every(item => typeof item === 'string')) return list;
      } catch { /* The error below identifies the actual invalid CSV field. */ }
      errors.push(`Row ${line}: ${column === 'skills' ? 'Required_Skills' : 'Tools_And_Fixtures'} must be a JSON array of strings.`);
      return undefined;
    };
    const task: Task = {
      id: newTaskId(), code, name, duration, category: categoryText as TaskCategory,
      predecessors: [], assignedStationId, ergonomics: ergonomicsText as ErgonomicRating,
      ...(columns.has('description') ? { description: get('description') } : {}),
    };
    const requiredSkills = parseList('skills');
    const toolsAndFixtures = parseList('tools');
    if (requiredSkills !== undefined) task.requiredSkills = requiredSkills;
    if (toolsAndFixtures !== undefined) task.toolsAndFixtures = toolsAndFixtures;
    tasks.push(task);
    codeMap.set(normalizedCode, task.id);
    pendingPredecessors.push({ task, text: get('predecessors'), line });
  }
  for (const { task, text, line } of pendingPredecessors) {
    for (const token of text.split(/[;,|]/).map(value => value.trim()).filter(Boolean)) {
      const id = codeMap.get(token.toUpperCase());
      if (id) task.predecessors.push(id);
      else errors.push(`Row ${line}: Unknown predecessor code "${token}" for task "${task.code}".`);
    }
  }
  if (!errors.length) errors.push(...validateLineModel(existingStations, tasks).map(issue => `${issue.path}: ${issue.message}`));
  return { tasks: errors.length ? [] : tasks, errors };
}

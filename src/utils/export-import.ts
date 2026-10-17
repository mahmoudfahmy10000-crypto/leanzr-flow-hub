/**
 * LEANZR FlowLab - Data Import & Export Utilities
 * Supports RFC-4180 CSV export/import and complete FlowLab JSON serialization.
 */

import { FlowProject, Task, Workstation, TaskCategory, ErgonomicRating } from '../types/flowlab.ts';

export function exportTasksToCSV(tasks: Task[], stations: Workstation[]): string {
  const stationMap = new Map<string, string>();
  stations.forEach((s) => stationMap.set(s.id, s.code));

  const headers = ['Code', 'Name', 'Duration_s', 'Category', 'Station_Code', 'Predecessors', 'Ergonomics', 'Description'];
  const rows = tasks.map((t) => {
    const stationCode = t.assignedStationId ? (stationMap.get(t.assignedStationId) || '') : 'UNASSIGNED';
    const predCodes = t.predecessors
      .map((pid) => tasks.find((item) => item.id === pid)?.code || pid)
      .join(';');

    const escape = (val: string | number | undefined) => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    return [
      escape(t.code),
      escape(t.name),
      t.duration,
      escape(t.category),
      escape(stationCode),
      escape(predCodes),
      escape(t.ergonomics),
      escape(t.description || ''),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseTasksCSV(
  csvText: string,
  existingStations: Workstation[]
): { tasks: Task[]; errors: string[] } {
  const errors: string[] = [];
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    return { tasks: [], errors: ['CSV file is empty or missing data rows.'] };
  }

  // Parse CSV line handling quotes
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const header = parseLine(lines[0]).map((h) => h.toLowerCase());
  const codeIdx = header.findIndex((h) => h.includes('code'));
  const nameIdx = header.findIndex((h) => h.includes('name'));
  const durIdx = header.findIndex((h) => h.includes('dur') || h.includes('time'));
  const catIdx = header.findIndex((h) => h.includes('cat') || h.includes('type'));
  const stIdx = header.findIndex((h) => h.includes('stat'));
  const predIdx = header.findIndex((h) => h.includes('pred'));
  const ergoIdx = header.findIndex((h) => h.includes('ergo'));
  const descIdx = header.findIndex((h) => h.includes('desc'));

  if (nameIdx === -1 || durIdx === -1) {
    return { tasks: [], errors: ['Required columns "Name" and "Duration" were not found in CSV header.'] };
  }

  const stationCodeMap = new Map<string, string>();
  existingStations.forEach((s) => {
    stationCodeMap.set(s.code.toUpperCase(), s.id);
    stationCodeMap.set(s.name.toUpperCase(), s.id);
  });

  const parsedTasks: Task[] = [];
  const codeToIdMap = new Map<string, string>();
  const rawPreds: { taskId: string; predString: string }[] = [];

  for (let r = 1; r < lines.length; r++) {
    const cols = parseLine(lines[r]);
    if (cols.length < 2) continue;

    const code = codeIdx !== -1 && cols[codeIdx] ? cols[codeIdx] : `T-${String(r).padStart(2, '0')}`;
    const name = cols[nameIdx] || `Task ${r}`;
    const duration = parseFloat(cols[durIdx]);

    if (isNaN(duration) || duration <= 0) {
      errors.push(`Row ${r}: Invalid duration for task "${name}". Must be positive number.`);
      continue;
    }

    let category: TaskCategory = 'VA';
    if (catIdx !== -1 && cols[catIdx]) {
      const catVal = cols[catIdx].toUpperCase();
      if (catVal.includes('NVA') && !catVal.includes('NVAR')) category = 'NVA';
      else if (catVal.includes('NVAR') || catVal.includes('TYPE 1')) category = 'NVAR';
      else category = 'VA';
    }

    let assignedStationId: string | null = null;
    if (stIdx !== -1 && cols[stIdx]) {
      const stVal = cols[stIdx].toUpperCase();
      if (stVal !== 'UNASSIGNED' && stationCodeMap.has(stVal)) {
        assignedStationId = stationCodeMap.get(stVal)!;
      }
    }

    let ergonomics: ErgonomicRating = 'low';
    if (ergoIdx !== -1 && cols[ergoIdx]) {
      const eVal = cols[ergoIdx].toLowerCase();
      if (eVal.includes('high')) ergonomics = 'high';
      else if (eVal.includes('mod')) ergonomics = 'moderate';
    }

    const taskId = `imported-task-${Date.now()}-${r}`;
    codeToIdMap.set(code.toUpperCase(), taskId);

    parsedTasks.push({
      id: taskId,
      code,
      name,
      duration,
      category,
      predecessors: [],
      assignedStationId,
      ergonomics,
      description: descIdx !== -1 ? cols[descIdx] : undefined,
    });

    if (predIdx !== -1 && cols[predIdx]) {
      rawPreds.push({ taskId, predString: cols[predIdx] });
    }
  }

  // Resolve predecessors
  rawPreds.forEach(({ taskId, predString }) => {
    const task = parsedTasks.find((t) => t.id === taskId);
    if (!task) return;
    const tokens = predString.split(/[;,|]/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    const resolvedIds: string[] = [];
    tokens.forEach((token) => {
      if (codeToIdMap.has(token)) {
        resolvedIds.push(codeToIdMap.get(token)!);
      }
    });
    task.predecessors = resolvedIds;
  });

  return { tasks: parsedTasks, errors };
}

/** Browser persistence with validated reads, a recoverable prior revision, and explicit failures. */
import type { FlowProject, Scenario } from '../types/flowlab.ts';
import { sampleProjects, evBatteryModuleProject } from './sample-projects.ts';
import { validateProject } from './project-validation.ts';

const STORAGE_KEY = 'leanzr_flowlab_active_project';
const SAVED_PROJECTS_KEY = 'leanzr_flowlab_saved_projects';
const RECOVERY_KEY = 'leanzr_flowlab_previous_project';
const PROTECTED_RAW_KEY = 'leanzr_flowlab_protected_recovery_data';
export type StorageResult = { success: true } | { success: false; error: string };
export interface WorkspaceLoad { project: FlowProject; warning?: string; protectedRaw?: string }

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const fallbackProject = (): FlowProject => clone(evBatteryModuleProject);
const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error);

function parseStoredProject(raw: string): FlowProject | null {
  try {
    const result = validateProject(JSON.parse(raw));
    return result.valid ? result.value : null;
  } catch { return null; }
}

function parseProjectList(raw: string): FlowProject[] | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    const ids = new Set<string>();
    const projects: FlowProject[] = [];
    for (const candidate of value) {
      const result = validateProject(candidate);
      if (!result.valid || ids.has(result.value.id)) return null;
      projects.push(result.value);
      ids.add(result.value.id);
    }
    return projects;
  } catch { return null; }
}

export function loadWorkspace(): WorkspaceLoad {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const project = parseStoredProject(raw);
      if (!project) return {
        project: fallbackProject(), protectedRaw: raw,
        warning: 'The stored active project is invalid. Its original data is preserved, and saving is paused. Download the original data or explicitly start a recovery workspace.',
      };
      const savedRaw = localStorage.getItem(SAVED_PROJECTS_KEY);
      if (savedRaw !== null && !parseProjectList(savedRaw)) return {
        project, protectedRaw: savedRaw,
        warning: 'The saved project catalog is invalid. Its original data is preserved, and saving is paused. Download the original data or explicitly start a recovery workspace.',
      };
      return { project };
    }
    const savedRaw = localStorage.getItem(SAVED_PROJECTS_KEY);
    if (savedRaw !== null && !parseProjectList(savedRaw)) return {
      project: fallbackProject(), protectedRaw: savedRaw,
      warning: 'The saved project catalog is invalid. Its original data is preserved, and saving is paused. Download the original data or explicitly start a recovery workspace.',
    };
    return { project: fallbackProject() };
  } catch (error) {
    return { project: fallbackProject(), warning: `Browser storage is unavailable: ${errorText(error)}. Export your work as JSON to preserve it.` };
  }
}

/** Kept for existing consumers; the App uses loadWorkspace to show recovery warnings. */
export function loadActiveProject(): FlowProject { return loadWorkspace().project; }

function mergeProjects(...lists: FlowProject[][]): FlowProject[] {
  const projects = new Map<string, FlowProject>();
  for (const list of lists) for (const project of list) projects.set(project.id, project);
  return [...projects.values()];
}

export function loadSavedProjectsList(): FlowProject[] {
  try {
    const raw = localStorage.getItem(SAVED_PROJECTS_KEY);
    const saved = raw === null ? [] : parseProjectList(raw) ?? [];
    const activeRaw = localStorage.getItem(STORAGE_KEY);
    const active = activeRaw === null ? null : parseStoredProject(activeRaw);
    return clone(mergeProjects(sampleProjects, saved, active ? [active] : []));
  } catch { return clone(sampleProjects); }
}

/** localStorage writes are atomic per key. Roll back auxiliary keys if the final active write fails. */
function persistProject(project: FlowProject, allowRecovery: boolean): StorageResult {
  const validation = validateProject(project);
  if (!validation.valid) return { success: false, error: `Project was not saved: ${validation.issues.map(issue => `${issue.path}: ${issue.message}`).join(' ')}` };
  const changedKeys: { key: string; previous: string | null }[] = [];
  try {
    const previousRaw = localStorage.getItem(STORAGE_KEY);
    const previous = previousRaw === null ? null : parseStoredProject(previousRaw);
    const savedRaw = localStorage.getItem(SAVED_PROJECTS_KEY);
    const saved = savedRaw === null ? [] : parseProjectList(savedRaw);
    const activeInvalid = previousRaw !== null && !previous;
    if (!allowRecovery && activeInvalid) return { success: false, error: 'The stored active project is invalid and has been preserved. Download its original data or explicitly start a recovery workspace.' };
    if (!allowRecovery && !saved) return { success: false, error: 'The stored project catalog is invalid and has been preserved. Download its original data or explicitly start a recovery workspace.' };
    const candidate: FlowProject = { ...project, lastModified: new Date().toISOString() };
    const candidateRaw = JSON.stringify(candidate);
    const catalogRaw = JSON.stringify(mergeProjects(saved ?? [], previous ? [previous] : [], [candidate]));
    const writeAuxiliary = (key: string, next: string) => {
      const old = localStorage.getItem(key);
      if (old === next) return;
      localStorage.setItem(key, next);
      changedKeys.push({ key, previous: old });
    };
    if (allowRecovery && (activeInvalid || !saved)) {
      const backup = JSON.stringify({
        recoveredAt: new Date().toISOString(),
        ...(activeInvalid ? { activeProjectRaw: previousRaw } : {}),
        ...(!saved ? { savedProjectsRaw: savedRaw } : {}),
        previousRecoveryRaw: localStorage.getItem(PROTECTED_RAW_KEY),
      });
      writeAuxiliary(PROTECTED_RAW_KEY, backup);
      if (localStorage.getItem(PROTECTED_RAW_KEY) !== backup) throw new Error('The original data backup could not be verified');
    }
    if (previousRaw !== null && previous && previousRaw !== candidateRaw) writeAuxiliary(RECOVERY_KEY, previousRaw);
    writeAuxiliary(SAVED_PROJECTS_KEY, catalogRaw);
    localStorage.setItem(STORAGE_KEY, candidateRaw);
    return { success: true };
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const entry of changedKeys.reverse()) {
      try {
        if (entry.previous === null) localStorage.removeItem(entry.key);
        else localStorage.setItem(entry.key, entry.previous);
      } catch (rollbackError) { rollbackErrors.push(errorText(rollbackError)); }
    }
    return {
      success: false,
      error: `Project was not saved: ${errorText(error)}. Export your in-memory project as JSON.${rollbackErrors.length ? ' Some recovery/catalog writes could not be rolled back; the active project was not replaced.' : ''}`,
    };
  }
}

export function saveActiveProject(project: FlowProject): StorageResult { return persistProject(project, false); }

/** Explicit recovery first writes and verifies a backup of corrupt payloads, then replaces them. */
export function recoverWorkspace(project: FlowProject): StorageResult { return persistProject(project, true); }

export function loadProtectedRaw(): string | null {
  try {
    const archived = localStorage.getItem(PROTECTED_RAW_KEY);
    if (archived !== null) return archived;
    const active = localStorage.getItem(STORAGE_KEY);
    if (active !== null && !parseStoredProject(active)) return active;
    const saved = localStorage.getItem(SAVED_PROJECTS_KEY);
    return saved !== null && !parseProjectList(saved) ? saved : null;
  } catch { return null; }
}

export function saveProjectsList(projects: FlowProject[]): StorageResult {
  try {
    const candidate = parseProjectList(JSON.stringify(projects));
    if (!candidate) return { success: false, error: 'The project catalog was not saved because it contains invalid or duplicate projects.' };
    const current = localStorage.getItem(SAVED_PROJECTS_KEY);
    const existing = current === null ? [] : parseProjectList(current);
    if (!existing) return { success: false, error: 'The existing project catalog is invalid and has been preserved for recovery.' };
    localStorage.setItem(SAVED_PROJECTS_KEY, JSON.stringify(mergeProjects(existing, candidate)));
    return { success: true };
  } catch (error) { return { success: false, error: `The project catalog was not saved: ${errorText(error)}.` }; }
}

export function loadRecoveryProject(): FlowProject | null {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    return raw === null ? null : parseStoredProject(raw);
  } catch { return null; }
}

let scenarioSequence = 0;
export function createScenarioSnapshot(project: FlowProject, name: string, description: string): Scenario {
  return {
    id: `scen-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${++scenarioSequence}-${Math.random().toString(36).slice(2)}`}`,
    name, description, createdAt: new Date().toISOString(),
    stations: clone(project.stations), tasks: clone(project.tasks), operatingParams: clone(project.operatingParams),
  };
}

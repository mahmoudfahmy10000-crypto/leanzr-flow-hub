/**
 * LEANZR FlowLab - Persistence and Project Management
 */

import { FlowProject, Scenario } from '../types/flowlab.ts';
import { sampleProjects, evBatteryModuleProject } from './sample-projects.ts';

const STORAGE_KEY = 'leanzr_flowlab_active_project';
const SAVED_PROJECTS_KEY = 'leanzr_flowlab_saved_projects';

export function loadActiveProject(): FlowProject {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id && Array.isArray(parsed.tasks) && Array.isArray(parsed.stations)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load project from localStorage:', e);
  }
  // Default to EV Battery project
  return JSON.parse(JSON.stringify(evBatteryModuleProject));
}

export function saveActiveProject(project: FlowProject): void {
  try {
    project.lastModified = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch (e) {
    console.error('Failed to save project to localStorage:', e);
  }
}

export function loadSavedProjectsList(): FlowProject[] {
  try {
    const raw = localStorage.getItem(SAVED_PROJECTS_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) {
        return list;
      }
    }
  } catch (e) {
    console.error('Failed to load saved projects list:', e);
  }
  return [...sampleProjects];
}

export function saveProjectsList(projects: FlowProject[]): void {
  try {
    localStorage.setItem(SAVED_PROJECTS_KEY, JSON.stringify(projects));
  } catch (e) {
    console.error('Failed to save projects list:', e);
  }
}

export function createScenarioSnapshot(project: FlowProject, name: string, description: string): Scenario {
  return {
    id: `scen-${Date.now()}`,
    name,
    description,
    createdAt: new Date().toISOString(),
    stations: JSON.parse(JSON.stringify(project.stations)),
    tasks: JSON.parse(JSON.stringify(project.tasks)),
    operatingParams: JSON.parse(JSON.stringify(project.operatingParams)),
  };
}

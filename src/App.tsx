/**
 * LEANZR FlowLab - Industrial Engineering Line Balancing & Yamazumi Studio
 */

import React, { useState, useMemo, useRef } from 'react';
import { FlowProject, Task, Workstation, OperatingParameters, Scenario } from './types/flowlab.ts';
import { calculateLineMetrics } from './utils/engineering-math.ts';
import {
  loadWorkspace,
  loadSavedProjectsList,
  loadRecoveryProject,
  loadProtectedRaw,
  recoverWorkspace,
  saveActiveProject,
  createScenarioSnapshot,
} from './utils/storage.ts';
import {
  exportTasksToCSV,
  downloadFile,
  parseTasksCSV,
  parseProjectJSON,
} from './utils/export-import.ts';
import { validateProject } from './utils/project-validation.ts';
import { Modal } from './components/Modal.tsx';
import { evBatteryModuleProject } from './utils/sample-projects.ts';

import { TopNav } from './components/TopNav.tsx';
import { KPIRow } from './components/KPIRow.tsx';
import { YamazumiChart } from './components/YamazumiChart.tsx';
import { BalancingBoard } from './components/BalancingBoard.tsx';
import { PrecedenceGraph } from './components/PrecedenceGraph.tsx';
import { ScenarioCompare } from './components/ScenarioCompare.tsx';
import { TaskModal } from './components/TaskModal.tsx';
import { OperatingParamsModal } from './components/OperatingParamsModal.tsx';
import { OptimizerModal } from './components/OptimizerModal.tsx';
import { KaizenPlaybookModal } from './components/KaizenPlaybookModal.tsx';
import { PrintReportView } from './components/PrintReportView.tsx';

export default function App() {
  const [initialWorkspace] = useState(() => loadWorkspace());
  const [project, setProject] = useState<FlowProject>(initialWorkspace.project);
  const [protectedRaw, setProtectedRaw] = useState(initialWorkspace.protectedRaw);
  const [error, setError] = useState<string | null>(initialWorkspace.warning ?? null);
  const [saveStatus, setSaveStatus] = useState('Local workspace');
  const [recoveryProject, setRecoveryProject] = useState(() => loadRecoveryProject());
  const [pendingImport, setPendingImport] = useState<{candidate: FlowProject; base: FlowProject; name: string} | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const [activeTab, setActiveTab] = useState<'board' | 'precedence' | 'scenarios'>('board');

  // Modals state
  const [isParamsOpen, setIsParamsOpen] = useState(false);
  const [isOptimizerOpen, setIsOptimizerOpen] = useState(false);
  const [isPlaybookOpen, setIsPlaybookOpen] = useState(false);
  const [isPrintReportView, setIsPrintReportView] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [activeEditingTask, setActiveEditingTask] = useState<Task | null>(null);

  // Notifications / toasts
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Persist only validated transitions. A failed archive/write never replaces the current model.
  const commitProject = (candidate: unknown): boolean => {
    const checked = validateProject(candidate);
    if (!checked.valid) {
      setError(checked.issues.map(issue => issue.message).join(' '));
      return false;
    }
    const evaluated = calculateLineMetrics(checked.value.stations, checked.value.tasks, checked.value.operatingParams);
    if (evaluated.assessment.status === 'invalid') {
      setError(evaluated.assessment.reasons.map(reason => reason.message).join(' '));
      return false;
    }
    if (protectedRaw !== undefined) {
      setError('A saved payload needs recovery. Download the original and start a recovery workspace before editing.');
      return false;
    }
    let next: FlowProject;
    try {
      next = structuredClone(checked.value);
    } catch {
      setError('The project contains metadata that cannot be copied safely. Existing data is unchanged; export a JSON backup before editing the metadata.');
      return false;
    }
    next.lastModified = new Date().toISOString();
    const saved = saveActiveProject(next);
    if (!saved.success) {
      setError(`Change not applied: ${saved.error} Download a JSON backup before retrying.`);
      setSaveStatus('Save failed — previous project retained');
      return false;
    }
    projectRef.current = next;
    setProject(next);
    setRecoveryProject(loadRecoveryProject());
    setSaveStatus('Saved locally');
    setError(null);
    return true;
  };

  const metrics = useMemo(() => calculateLineMetrics(
    project.stations, project.tasks, project.operatingParams,
  ), [project.stations, project.tasks, project.operatingParams]);

  const handleSelectProject = (benchmark: FlowProject) => {
    const saved = loadSavedProjectsList().find(item => item.id === benchmark.id);
    if (commitProject(structuredClone(saved ?? benchmark))) showToast(`Loaded project: ${(saved ?? benchmark).name}`);
  };

  const handleResetProject = () => {
    if (commitProject(structuredClone(evBatteryModuleProject))) showToast('Default benchmark loaded. Previous revision remains recoverable.');
  };

  const handleUpdateStation = (updated: Workstation) => {
    commitProject({...project, stations: project.stations.map(station => station.id === updated.id ? updated : station)});
  };

  const handleAddStation = () => {
    const codes = new Set(project.stations.map(station => station.code.trim().toUpperCase()));
    let index = 1;
    while (codes.has(`ST-${String(index).padStart(2, '0')}`)) index++;
    const station: Workstation = {
      id: `station-${crypto.randomUUID()}`, code: `ST-${String(index).padStart(2, '0')}`,
      name: `Station ${index}`, operatorCount: 1,
    };
    if (commitProject({...project, stations: [...project.stations, station]})) showToast(`Added workstation ${station.code}`);
  };

  const handleDeleteStation = (stationId: string) => {
    if (project.stations.length <= 1) return;
    if (commitProject({...project,
      stations: project.stations.filter(station => station.id !== stationId),
      tasks: project.tasks.map(task => task.assignedStationId === stationId ? {...task, assignedStationId: null} : task),
    })) showToast('Workstation deleted. Its tasks remain in backlog.');
  };

  const handleMoveTask = (taskId: string, stationId: string | null) => {
    commitProject({...project, tasks: project.tasks.map(task => task.id === taskId ? {...task, assignedStationId:stationId} : task)});
  };

  const handleSaveTask = (task: Task): boolean => {
    const tasks = project.tasks.some(item => item.id === task.id)
      ? project.tasks.map(item => item.id === task.id ? {...item, ...task} : item)
      : [...project.tasks, task];
    const applied = commitProject({...project, tasks});
    if (applied) showToast(`Saved task ${task.code}`);
    return applied;
  };

  const handleDeleteTask = (taskId: string) => {
    if (commitProject({...project, tasks: project.tasks.filter(task => task.id !== taskId)
      .map(task => ({...task, predecessors: task.predecessors.filter(id => id !== taskId)}))})) showToast('Task removed. Previous revision remains recoverable.');
  };

  const handleSaveParams = (operatingParams: OperatingParameters): boolean => {
    const applied = commitProject({...project, operatingParams});
    if (applied) showToast('Operating parameters updated.');
    return applied;
  };

  const handleApplyOptimization = (stations: Workstation[], tasks: Task[]): boolean => {
    const evaluated = calculateLineMetrics(stations, tasks, project.operatingParams);
    if (evaluated.assessment.status !== 'valid') {
      setError(`Optimization cannot be applied: ${evaluated.assessment.reasons.map(reason => reason.message).join(' ')}`);
      return false;
    }
    const applied = commitProject({...project, stations, tasks});
    if (applied) showToast('Validated optimization applied.');
    return applied;
  };

  const handleCreateScenario = (name: string, description: string) => {
    const scenario = createScenarioSnapshot(project, name, description);
    if (commitProject({...project, scenarios: [...project.scenarios, scenario]})) showToast(`Snapshot created: "${name}"`);
  };

  const handleActivateScenario = (scenario: Scenario) => {
    if (commitProject({...project,
      stations: structuredClone(scenario.stations), tasks: structuredClone(scenario.tasks),
      operatingParams: structuredClone(scenario.operatingParams), activeScenarioId:scenario.id,
    })) showToast(`Activated scenario: "${scenario.name}"`);
  };

  const handleDeleteScenario = (scenarioId: string) => {
    if (commitProject({...project, activeScenarioId: project.activeScenarioId === scenarioId ? undefined : project.activeScenarioId,
      scenarios: project.scenarios.filter(scenario => scenario.id !== scenarioId),
    })) showToast('Scenario removed. Previous revision remains recoverable.');
  };

  const handleExportCSV = () => {
    downloadFile(exportTasksToCSV(project.tasks, project.stations), `${project.name.replace(/\s+/g, '_')}_tasks.csv`, 'text/csv');
    showToast('Downloaded tasks CSV.');
  };

  const handleExportJSON = () => {
    downloadFile(JSON.stringify(project, null, 2), `${project.name.replace(/\s+/g, '_')}_backup.json`, 'application/json');
    showToast('Downloaded project backup JSON.');
  };

  const handleCSVFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const base = projectRef.current;
    const reader = new FileReader();
    reader.onerror = () => setError('The selected file could not be read. Existing project data is unchanged.');
    reader.onload = () => {
      if (projectRef.current !== base) {
        setError('The project changed while reading the file. Select the file again to import into the current project.');
        return;
      }
      const text = String(reader.result ?? '');
      let candidate: FlowProject;
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = parseProjectJSON(text);
        if (!parsed.valid) {
          setError(`Import rejected; existing data is unchanged. ${parsed.issues.map(issue => issue.message).join(' ')}`);
          return;
        }
        candidate = parsed.value;
      } else {
        const parsed = parseTasksCSV(text, base.stations);
        if (parsed.errors.length) {
          setError(`Import rejected; existing data is unchanged. ${parsed.errors.join(' ')}`);
          return;
        }
        candidate = {...base, tasks:parsed.tasks};
      }
      const validated = validateProject(candidate);
      if (!validated.valid) {
        setError(`Import rejected; existing data is unchanged. ${validated.issues.map(issue => issue.message).join(' ')}`);
        return;
      }
      const evaluated = calculateLineMetrics(candidate.stations, candidate.tasks, candidate.operatingParams);
      if (evaluated.assessment.status === 'invalid') {
        setError(`Import rejected; existing data is unchanged. ${evaluated.assessment.reasons.map(reason => reason.message).join(' ')}`);
        return;
      }
      setError(null);
      setPendingImport({candidate: validated.value, base, name:file.name});
    };
    reader.readAsText(file);
  };

  // If in Print Report View, render dedicated document
  if (isPrintReportView) {
    return (
      <PrintReportView
        project={project}
        metrics={metrics}
        onBack={() => setIsPrintReportView(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Hidden File Input for CSV/JSON */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.json"
        className="hidden"
        onChange={handleCSVFileInput}
      />

      {/* Top Bar Contract Navigation */}
      <TopNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        project={project}
        projects={loadSavedProjectsList()}
        onSelectProject={handleSelectProject}
        onOpenOptimizer={() => setIsOptimizerOpen(true)}
        onOpenPlaybook={() => setIsPlaybookOpen(true)}
        onOpenPrintReport={() => setIsPrintReportView(true)}
        onExportJSON={handleExportJSON}
        onExportCSV={handleExportCSV}
        onImportCSVClick={() => fileInputRef.current?.click()}
        onResetProject={handleResetProject}
      />

      <section className="mx-4 my-2 text-xs text-slate-300" aria-label="Workspace storage">
        <span role="status" data-testid="save-status">{saveStatus}</span>
        {recoveryProject && protectedRaw === undefined && (
          <button className="ml-4 text-cyan-300 underline" onClick={() => {
            if (commitProject(structuredClone(recoveryProject))) showToast('Previous saved revision restored.');
          }}>Restore previous saved revision</button>
        )}
        {(protectedRaw !== undefined || loadProtectedRaw() !== null) && (
          <button className="ml-4 text-cyan-300 underline" onClick={() => {
            const raw = protectedRaw ?? loadProtectedRaw();
            if (raw !== null && raw !== undefined) downloadFile(raw, 'leanzr_original_recovery.json', 'application/json');
          }}>Download original recovery data</button>
        )}
        {protectedRaw !== undefined && (
          <button className="ml-4 text-amber-300 underline" onClick={() => {
            const saved = recoverWorkspace(project);
            if (!saved.success) {setError(saved.error); return;}
            setProtectedRaw(undefined);
            setSaveStatus('Recovered workspace — original payload retained');
            setError(null);
          }}>Start recovery workspace</button>
        )}
        {error && <div role="alert" data-testid="workspace-error" className="mt-2 rounded-lg border border-rose-700 bg-rose-950/50 p-3 text-rose-200">{error}</div>}
      </section>

      {/* Industrial Engineering KPI Strip */}
      <KPIRow
        metrics={metrics}
        params={project.operatingParams}
        onOpenParams={() => setIsParamsOpen(true)}
      />

      {/* Main Workspace Body */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {activeTab === 'board' && (
          <>
            {/* Interactive Yamazumi Chart */}
            <YamazumiChart
              metrics={metrics}
              onSelectTask={(task) => {
                setActiveEditingTask(task);
              }}
              onOpenTaskModal={(task) => {
                setActiveEditingTask(task);
                setIsTaskModalOpen(true);
              }}
            />

            {/* Workstation Kanban Board */}
            <BalancingBoard
              stations={project.stations}
              tasks={project.tasks}
              metrics={metrics}
              onUpdateStation={handleUpdateStation}
              onAddStation={handleAddStation}
              onDeleteStation={handleDeleteStation}
              onMoveTask={handleMoveTask}
              onEditTask={(task) => {
                setActiveEditingTask(task);
                setIsTaskModalOpen(true);
              }}
              onDeleteTask={handleDeleteTask}
              onOpenNewTaskModal={() => {
                setActiveEditingTask(null);
                setIsTaskModalOpen(true);
              }}
            />
          </>
        )}

        {activeTab === 'precedence' && (
          <PrecedenceGraph
            tasks={project.tasks}
            stations={project.stations}
            onSelectTask={(task) => {
              setActiveEditingTask(task);
              setIsTaskModalOpen(true);
            }}
          />
        )}

        {activeTab === 'scenarios' && (
          <ScenarioCompare
            project={project}
            currentMetrics={metrics}
            onActivateScenario={handleActivateScenario}
            onCreateScenario={handleCreateScenario}
            onDeleteScenario={handleDeleteScenario}
          />
        )}
      </main>

      {/* Floating Status Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-800 border border-slate-700 text-white text-xs font-medium px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <Modal isOpen={pendingImport !== null} title="Review project import" onClose={() => setPendingImport(null)} className="max-w-lg">
        {pendingImport && <div className="p-5 text-sm text-slate-200 space-y-4">
          <p>Replace the active workspace using <strong>{pendingImport.name}</strong>?</p>
          <p>{pendingImport.candidate.tasks.length} tasks and {pendingImport.candidate.stations.length} workstations passed structural and graph validation. Engineering status: <strong>{calculateLineMetrics(pendingImport.candidate.stations, pendingImport.candidate.tasks, pendingImport.candidate.operatingParams).assessment.status}</strong>.</p>
          <p className="text-xs text-slate-400">Your previous saved revision will be retained for recovery. An import is not engineering approval.</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setPendingImport(null)}>Cancel import</button>
            <button className="rounded bg-cyan-600 px-3 py-2" onClick={() => {
              if (projectRef.current !== pendingImport.base) {
                setError('The active project changed. Cancel and reselect the import file.');
                setPendingImport(null);
                return;
              }
              if (commitProject(pendingImport.candidate)) {
                setPendingImport(null);
                showToast('Validated import applied; previous revision retained.');
              }
            }}>Replace workspace</button>
          </div>
        </div>}
      </Modal>

      {/* Modals */}
      <OperatingParamsModal
        isOpen={isParamsOpen}
        onClose={() => setIsParamsOpen(false)}
        params={project.operatingParams}
        onSaveParams={handleSaveParams}
        saveError={error}
      />

      <OptimizerModal
        isOpen={isOptimizerOpen}
        onClose={() => setIsOptimizerOpen(false)}
        tasks={project.tasks}
        stations={project.stations}
        params={project.operatingParams}
        currentMetrics={metrics}
        onApplyOptimization={handleApplyOptimization}
        saveError={error}
        onSaveAsScenario={(name, stations, tasks) => {
          const evaluated = calculateLineMetrics(stations, tasks, project.operatingParams);
          if (evaluated.assessment.status !== 'valid') {
            setError('Only a valid optimization can be saved as an optimized scenario.');
            return false;
          }
          const scenario = createScenarioSnapshot({...project, stations, tasks}, name, 'Created by deterministic optimizer');
          const applied = commitProject({...project, scenarios: [...project.scenarios, scenario]});
          if (applied) showToast(`Saved optimized scenario: "${name}"`);
          return applied;
        }}
      />

      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setActiveEditingTask(null);
        }}
        task={activeEditingTask}
        stations={project.stations}
        allTasks={project.tasks}
        onSaveTask={handleSaveTask}
        saveError={error}
        onDeleteTask={handleDeleteTask}
      />

      <KaizenPlaybookModal
        isOpen={isPlaybookOpen}
        onClose={() => setIsPlaybookOpen(false)}
      />
    </div>
  );
}

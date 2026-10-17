/**
 * LEANZR FlowLab - Industrial Engineering Line Balancing & Yamazumi Studio
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FlowProject, Task, Workstation, OperatingParameters, Scenario } from './types/flowlab.ts';
import { calculateLineMetrics } from './utils/engineering-math.ts';
import {
  loadActiveProject,
  saveActiveProject,
  createScenarioSnapshot,
} from './utils/storage.ts';
import {
  exportTasksToCSV,
  downloadFile,
  parseTasksCSV,
} from './utils/export-import.ts';
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
  const [project, setProject] = useState<FlowProject>(() => loadActiveProject());
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

  // Auto-save on changes
  useEffect(() => {
    saveActiveProject(project);
  }, [project]);

  // Real-time engineering line calculations
  const metrics = useMemo(() => {
    return calculateLineMetrics(
      project.stations,
      project.tasks,
      project.operatingParams
    );
  }, [project.stations, project.tasks, project.operatingParams]);

  // Project Switcher
  const handleSelectProject = (newProj: FlowProject) => {
    setProject(JSON.parse(JSON.stringify(newProj)));
    showToast(`Loaded benchmark: ${newProj.name}`);
  };

  // Reset to default
  const handleResetProject = () => {
    setProject(JSON.parse(JSON.stringify(evBatteryModuleProject)));
    showToast('Project reset to EV Battery Module benchmark.');
  };

  // Workstation Handlers
  const handleUpdateStation = (updated: Workstation) => {
    setProject((prev) => ({
      ...prev,
      stations: prev.stations.map((s) => (s.id === updated.id ? updated : s)),
    }));
  };

  const handleAddStation = () => {
    const nextIdx = project.stations.length + 1;
    const newStation: Workstation = {
      id: `station-${Date.now()}`,
      code: `ST-${String(nextIdx).padStart(2, '0')}`,
      name: `Station ${nextIdx}`,
      operatorCount: 1,
    };
    setProject((prev) => ({
      ...prev,
      stations: [...prev.stations, newStation],
    }));
    showToast(`Added Workstation ${newStation.code}`);
  };

  const handleDeleteStation = (stationId: string) => {
    if (project.stations.length <= 1) return;
    setProject((prev) => ({
      ...prev,
      stations: prev.stations.filter((s) => s.id !== stationId),
      // Tasks on this station move to unassigned backlog
      tasks: prev.tasks.map((t) =>
        t.assignedStationId === stationId ? { ...t, assignedStationId: null } : t
      ),
    }));
    showToast('Workstation deleted. Allocated tasks moved to backlog.');
  };

  // Task Handlers
  const handleMoveTask = (taskId: string, targetStationId: string | null) => {
    setProject((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) =>
        t.id === taskId ? { ...t, assignedStationId: targetStationId } : t
      ),
    }));
  };

  const handleSaveTask = (savedTask: Task) => {
    setProject((prev) => {
      const exists = prev.tasks.some((t) => t.id === savedTask.id);
      if (exists) {
        return {
          ...prev,
          tasks: prev.tasks.map((t) => (t.id === savedTask.id ? savedTask : t)),
        };
      }
      return {
        ...prev,
        tasks: [...prev.tasks, savedTask],
      };
    });
    showToast(`Saved task ${savedTask.code}`);
  };

  const handleDeleteTask = (taskId: string) => {
    setProject((prev) => ({
      ...prev,
      tasks: prev.tasks
        .filter((t) => t.id !== taskId)
        .map((t) => ({
          ...t,
          predecessors: t.predecessors.filter((pid) => pid !== taskId),
        })),
    }));
    showToast('Task removed from line.');
  };

  // Parameters Update
  const handleSaveParams = (newParams: OperatingParameters) => {
    setProject((prev) => ({
      ...prev,
      operatingParams: newParams,
    }));
    showToast('Operating parameters and Takt time updated.');
  };

  // Optimizer Apply
  const handleApplyOptimization = (newStations: Workstation[], newTasks: Task[]) => {
    setProject((prev) => ({
      ...prev,
      stations: newStations,
      tasks: newTasks,
    }));
    showToast('Optimized line balance applied successfully!');
  };

  // Scenario Handlers
  const handleCreateScenario = (name: string, description: string) => {
    const scen = createScenarioSnapshot(project, name, description);
    setProject((prev) => ({
      ...prev,
      scenarios: [...prev.scenarios, scen],
    }));
    showToast(`Snapshot created: "${name}"`);
  };

  const handleActivateScenario = (scen: Scenario) => {
    setProject((prev) => ({
      ...prev,
      stations: JSON.parse(JSON.stringify(scen.stations)),
      tasks: JSON.parse(JSON.stringify(scen.tasks)),
      operatingParams: JSON.parse(JSON.stringify(scen.operatingParams)),
    }));
    showToast(`Activated scenario: "${scen.name}"`);
  };

  const handleDeleteScenario = (scenarioId: string) => {
    setProject((prev) => ({
      ...prev,
      scenarios: prev.scenarios.filter((s) => s.id !== scenarioId),
    }));
    showToast('Scenario removed.');
  };

  // Export / Import
  const handleExportCSV = () => {
    const csv = exportTasksToCSV(project.tasks, project.stations);
    downloadFile(csv, `${project.name.replace(/\s+/g, '_')}_tasks.csv`, 'text/csv');
    showToast('Downloaded tasks CSV.');
  };

  const handleExportJSON = () => {
    const jsonStr = JSON.stringify(project, null, 2);
    downloadFile(jsonStr, `${project.name.replace(/\s+/g, '_')}_backup.json`, 'application/json');
    showToast('Downloaded project backup JSON.');
  };

  const handleCSVFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        if (file.name.endsWith('.json')) {
          try {
            const parsed = JSON.parse(text);
            if (parsed && Array.isArray(parsed.tasks) && Array.isArray(parsed.stations)) {
              setProject(parsed);
              showToast('Restored project from JSON.');
              return;
            }
          } catch (err) {
            showToast('Invalid JSON file format.');
            return;
          }
        }

        const { tasks, errors } = parseTasksCSV(text, project.stations);
        if (errors.length > 0) {
          showToast(`CSV Import Notice: ${errors[0]}`);
        }
        if (tasks.length > 0) {
          setProject((prev) => ({
            ...prev,
            tasks,
          }));
          showToast(`Imported ${tasks.length} tasks successfully!`);
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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
        onSelectProject={handleSelectProject}
        onOpenOptimizer={() => setIsOptimizerOpen(true)}
        onOpenPlaybook={() => setIsPlaybookOpen(true)}
        onOpenPrintReport={() => setIsPrintReportView(true)}
        onExportJSON={handleExportJSON}
        onExportCSV={handleExportCSV}
        onImportCSVClick={() => fileInputRef.current?.click()}
        onResetProject={handleResetProject}
      />

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

      {/* Modals */}
      <OperatingParamsModal
        isOpen={isParamsOpen}
        onClose={() => setIsParamsOpen(false)}
        params={project.operatingParams}
        onSaveParams={handleSaveParams}
      />

      <OptimizerModal
        isOpen={isOptimizerOpen}
        onClose={() => setIsOptimizerOpen(false)}
        tasks={project.tasks}
        stations={project.stations}
        params={project.operatingParams}
        currentMetrics={metrics}
        onApplyOptimization={handleApplyOptimization}
        onSaveAsScenario={(name, stations, tasks) => {
          const scen: Scenario = {
            id: `scen-${Date.now()}`,
            name,
            description: 'Created by Deterministic Line Balancing Optimizer',
            createdAt: new Date().toISOString(),
            stations: JSON.parse(JSON.stringify(stations)),
            tasks: JSON.parse(JSON.stringify(tasks)),
            operatingParams: JSON.parse(JSON.stringify(project.operatingParams)),
          };
          setProject((prev) => ({
            ...prev,
            scenarios: [...prev.scenarios, scen],
          }));
          showToast(`Saved optimized scenario: "${name}"`);
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
        onDeleteTask={handleDeleteTask}
      />

      <KaizenPlaybookModal
        isOpen={isPlaybookOpen}
        onClose={() => setIsPlaybookOpen(false)}
      />
    </div>
  );
}

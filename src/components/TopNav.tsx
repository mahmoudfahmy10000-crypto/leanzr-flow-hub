/**
 * LEANZR FlowLab - Top Navigation Bar
 * Follows the 3-Zone Top Bar Contract from the Universal Frontend Design Constitution.
 */

import React, { useState } from 'react';
import { FlowProject } from '../types/flowlab.ts';
import { sampleProjects } from '../utils/sample-projects.ts';
import {
  Wand2,
  Download,
  Upload,
  FileSpreadsheet,
  Printer,
  ChevronDown,
  RotateCcw,
  Layers,
  FolderOpen,
} from 'lucide-react';

interface TopNavProps {
  activeTab: 'board' | 'precedence' | 'scenarios';
  setActiveTab: (tab: 'board' | 'precedence' | 'scenarios') => void;
  project: FlowProject;
  onSelectProject: (project: FlowProject) => void;
  onOpenOptimizer: () => void;
  onOpenPlaybook: () => void;
  onOpenPrintReport: () => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onImportCSVClick: () => void;
  onResetProject: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  setActiveTab,
  project,
  onSelectProject,
  onOpenOptimizer,
  onOpenPlaybook,
  onOpenPrintReport,
  onExportJSON,
  onExportCSV,
  onImportCSVClick,
  onResetProject,
}) => {
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  return (
    <header className="bg-slate-950 border-b border-slate-800 text-slate-100 px-4 lg:px-8 py-3.5 flex items-center justify-between gap-8 select-none">
      {/* Zone 1: Single text wordmark with subtle project badge */}
      <div className="flex items-center gap-3 shrink-0">
        <a
          href="/"
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-2"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
          <span>LEANZR</span>
          <span className="text-cyan-400 font-light">FlowLab</span>
        </a>

        {/* Project Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowProjectMenu(!showProjectMenu);
              setShowExportMenu(false);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 transition-colors cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
            <span className="max-w-[140px] truncate font-medium">{project.name}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {showProjectMenu && (
            <div className="absolute top-full left-0 mt-1.5 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-50">
              <div className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                Preset Industrial Benchmarks
              </div>
              {sampleProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onSelectProject(p);
                    setShowProjectMenu(false);
                  }}
                  className={`w-full text-left p-2 rounded-lg text-xs transition-colors cursor-pointer flex flex-col ${
                    project.id === p.id
                      ? 'bg-cyan-950/60 text-cyan-300 font-medium'
                      : 'hover:bg-slate-800 text-slate-200'
                  }`}
                >
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-[10px] text-slate-400 truncate">{p.partNumber} · {p.tasks.length} tasks</span>
                </button>
              ))}

              <div className="border-t border-slate-800 my-1 pt-1">
                <button
                  onClick={() => {
                    onResetProject();
                    setShowProjectMenu(false);
                  }}
                  className="w-full text-left p-2 rounded-lg text-xs text-amber-300 hover:bg-slate-800 transition-colors flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Project to Default
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Zone 2: 4 single-line concise navigation links */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
        <button
          onClick={() => setActiveTab('board')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
            activeTab === 'board'
              ? 'border-cyan-400 text-white font-semibold'
              : 'border-transparent text-slate-400'
          }`}
        >
          Yamazumi & Board
        </button>

        <button
          onClick={() => setActiveTab('precedence')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
            activeTab === 'precedence'
              ? 'border-cyan-400 text-white font-semibold'
              : 'border-transparent text-slate-400'
          }`}
        >
          Precedence Network
        </button>

        <button
          onClick={() => setActiveTab('scenarios')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
            activeTab === 'scenarios'
              ? 'border-cyan-400 text-white font-semibold'
              : 'border-transparent text-slate-400'
          }`}
        >
          What-If Scenarios
        </button>

        <button
          onClick={onOpenPlaybook}
          className="hover:text-white transition-colors whitespace-nowrap shrink-0 text-slate-400 cursor-pointer flex items-center gap-1"
        >
          <span>Kaizen Playbook</span>
        </button>
      </nav>

      {/* Zone 3: Primary action + utility menus */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Export / Report Menu */}
        <div className="relative">
          <button
            onClick={() => {
              setShowExportMenu(!showExportMenu);
              setShowProjectMenu(false);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium rounded-lg border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Export / Reports</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {showExportMenu && (
            <div className="absolute top-full right-0 mt-1.5 w-52 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 z-50 text-xs">
              <button
                onClick={() => {
                  onOpenPrintReport();
                  setShowExportMenu(false);
                }}
                className="w-full text-left p-2 rounded-lg hover:bg-slate-800 text-slate-200 transition-colors flex items-center gap-2"
              >
                <Printer className="w-3.5 h-3.5 text-cyan-400" />
                <span>Printable Audit Report</span>
              </button>

              <button
                onClick={() => {
                  onExportCSV();
                  setShowExportMenu(false);
                }}
                className="w-full text-left p-2 rounded-lg hover:bg-slate-800 text-slate-200 transition-colors flex items-center gap-2"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export Tasks CSV</span>
              </button>

              <button
                onClick={() => {
                  onImportCSVClick();
                  setShowExportMenu(false);
                }}
                className="w-full text-left p-2 rounded-lg hover:bg-slate-800 text-slate-200 transition-colors flex items-center gap-2"
              >
                <Upload className="w-3.5 h-3.5 text-amber-400" />
                <span>Import Tasks CSV</span>
              </button>

              <div className="border-t border-slate-800 my-1 pt-1">
                <button
                  onClick={() => {
                    onExportJSON();
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left p-2 rounded-lg hover:bg-slate-800 text-slate-200 transition-colors flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Backup Project (.json)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Primary Action Button: Deterministic Optimizer */}
        <button
          onClick={onOpenOptimizer}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Wand2 className="w-3.5 h-3.5" />
          <span>Auto-Balance Line</span>
        </button>
      </div>
    </header>
  );
};

/**
 * LEANZR FlowLab - Deterministic Line Balancing Optimizer Studio
 */

import React, { useState } from 'react';
import {
  Task,
  Workstation,
  LineCalculations,
  OperatingParameters,
} from '../types/flowlab.ts';
import {
  runRPWOptimization,
  runLPTOptimization,
  runSmoothnessLeveling,
  OptimizationResult,
} from '../utils/line-balancing-optimizer.ts';
import { calculateLineMetrics } from '../utils/engineering-math.ts';
import {
  Wand2,
  X,
  CheckCircle2,
  Sliders,
  TrendingUp,
  Cpu,
  Layers,
  Sparkles,
} from 'lucide-react';

interface OptimizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  stations: Workstation[];
  params: OperatingParameters;
  currentMetrics: LineCalculations;
  onApplyOptimization: (stations: Workstation[], tasks: Task[]) => void;
  onSaveAsScenario: (name: string, stations: Workstation[], tasks: Task[]) => void;
}

export const OptimizerModal: React.FC<OptimizerModalProps> = ({
  isOpen,
  onClose,
  tasks,
  stations,
  params,
  currentMetrics,
  onApplyOptimization,
  onSaveAsScenario,
}) => {
  const [algorithm, setAlgorithm] = useState<'rpw' | 'lpt' | 'leveling'>('rpw');
  const [targetMode, setTargetMode] = useState<'takt' | 'target' | 'custom'>('takt');
  const [customCT, setCustomCT] = useState(
    Math.round(currentMetrics.taktTimeSeconds > 0 ? currentMetrics.taktTimeSeconds : 100)
  );

  const getTargetTime = () => {
    if (targetMode === 'takt') return currentMetrics.taktTimeSeconds;
    if (targetMode === 'target') return currentMetrics.targetCycleTimeSeconds;
    return customCT;
  };

  // Run selected optimization deterministically
  const targetTime = getTargetTime();
  const optimizationResult: OptimizationResult = React.useMemo(() => {
    if (algorithm === 'rpw') {
      return runRPWOptimization(tasks, targetTime, stations);
    }
    if (algorithm === 'lpt') {
      return runLPTOptimization(tasks, targetTime, stations);
    }
    return runSmoothnessLeveling(stations, tasks, targetTime);
  }, [algorithm, targetTime, tasks, stations]);

  // Compute full metrics for the optimized result
  const optimizedMetrics = React.useMemo(() => {
    return calculateLineMetrics(
      optimizationResult.stations,
      optimizationResult.tasks,
      params
    );
  }, [optimizationResult, params]);

  if (!isOpen) return null;

  const effDelta = optimizedMetrics.lineBalancingEfficiencyPercent - currentMetrics.lineBalancingEfficiencyPercent;
  const ctDelta = optimizedMetrics.bottleneckCycleTime - currentMetrics.bottleneckCycleTime;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-700/60 flex items-center justify-center text-cyan-400">
              <Wand2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                Deterministic Line Balancing Optimizer
              </h2>
              <p className="text-xs text-slate-400">
                Helgeson-Birnie (RPW) & LPT industrial engineering heuristics
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Algorithm Selector */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 block">
              1. Select Balancing Algorithm
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setAlgorithm('rpw')}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  algorithm === 'rpw'
                    ? 'border-cyan-400 bg-cyan-950/30 text-white'
                    : 'border-slate-800 bg-slate-800/40 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold text-xs mb-1 flex items-center justify-between">
                  <span>Ranked Positional Weight</span>
                  {algorithm === 'rpw' && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />}
                </div>
                <p className="text-[11px] text-slate-400">
                  Helgeson-Birnie classic: sums downstream chain weights to minimize stations under Takt.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setAlgorithm('lpt')}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  algorithm === 'lpt'
                    ? 'border-cyan-400 bg-cyan-950/30 text-white'
                    : 'border-slate-800 bg-slate-800/40 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold text-xs mb-1 flex items-center justify-between">
                  <span>Longest Processing Time</span>
                  {algorithm === 'lpt' && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />}
                </div>
                <p className="text-[11px] text-slate-400">
                  Prioritizes largest task operations first to prevent late bottlenecks.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setAlgorithm('leveling')}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  algorithm === 'leveling'
                    ? 'border-cyan-400 bg-cyan-950/30 text-white'
                    : 'border-slate-800 bg-slate-800/40 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold text-xs mb-1 flex items-center justify-between">
                  <span>Workload Leveling (2-Opt)</span>
                  {algorithm === 'leveling' && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />}
                </div>
                <p className="text-[11px] text-slate-400">
                  Keeps existing stations and levels variances to minimize Smoothness Index.
                </p>
              </button>
            </div>
          </div>

          {/* Target Cycle Time Budget */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 block">
              2. Target Cycle Time Limit
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setTargetMode('takt')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  targetMode === 'takt'
                    ? 'bg-slate-800 text-cyan-300 border-cyan-400'
                    : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
              >
                Customer Takt ({currentMetrics.taktTimeSeconds.toFixed(1)}s)
              </button>
              <button
                type="button"
                onClick={() => setTargetMode('target')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  targetMode === 'target'
                    ? 'bg-slate-800 text-amber-300 border-amber-400'
                    : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
              >
                Target CT with Buffer ({currentMetrics.targetCycleTimeSeconds.toFixed(1)}s)
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTargetMode('custom')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    targetMode === 'custom'
                      ? 'bg-slate-800 text-white border-cyan-400'
                      : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                >
                  Custom Limit:
                </button>
                {targetMode === 'custom' && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={customCT}
                      onChange={(e) => setCustomCT(Math.max(10, parseFloat(e.target.value) || 10))}
                      className="w-20 px-2 py-1 bg-slate-800 border border-slate-700 rounded-md text-xs font-mono text-white focus:border-cyan-400 focus:outline-none"
                    />
                    <span className="text-xs text-slate-400">s</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Comparison Preview Table */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
            <h4 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Optimization Impact Comparison
            </h4>
            <div className="grid grid-cols-4 gap-4 text-xs font-mono">
              <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[11px] mb-1">Workstations</span>
                <div className="text-sm font-bold text-white flex items-center justify-between">
                  <span>{currentMetrics.actualWorkstationsCount} → {optimizedMetrics.actualWorkstationsCount}</span>
                  <span className={optimizedMetrics.actualWorkstationsCount <= currentMetrics.actualWorkstationsCount ? 'text-emerald-400' : 'text-amber-400'}>
                    {optimizedMetrics.actualWorkstationsCount - currentMetrics.actualWorkstationsCount > 0 ? `+${optimizedMetrics.actualWorkstationsCount - currentMetrics.actualWorkstationsCount}` : optimizedMetrics.actualWorkstationsCount - currentMetrics.actualWorkstationsCount}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[11px] mb-1">Bottleneck CT</span>
                <div className="text-sm font-bold text-white flex items-center justify-between">
                  <span>{currentMetrics.bottleneckCycleTime.toFixed(1)}s → {optimizedMetrics.bottleneckCycleTime.toFixed(1)}s</span>
                  <span className={ctDelta <= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {ctDelta <= 0 ? `${ctDelta.toFixed(1)}s` : `+${ctDelta.toFixed(1)}s`}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[11px] mb-1">Line Efficiency</span>
                <div className="text-sm font-bold text-white flex items-center justify-between">
                  <span>{currentMetrics.lineBalancingEfficiencyPercent.toFixed(1)}% → {optimizedMetrics.lineBalancingEfficiencyPercent.toFixed(1)}%</span>
                  <span className={effDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {effDelta >= 0 ? `+${effDelta.toFixed(1)}%` : `${effDelta.toFixed(1)}%`}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[11px] mb-1">Smoothness Index</span>
                <div className="text-sm font-bold text-white flex items-center justify-between">
                  <span>{currentMetrics.smoothnessIndex.toFixed(1)}s → {optimizedMetrics.smoothnessIndex.toFixed(1)}s</span>
                  <span className={optimizedMetrics.smoothnessIndex <= currentMetrics.smoothnessIndex ? 'text-emerald-400' : 'text-amber-400'}>
                    {(optimizedMetrics.smoothnessIndex - currentMetrics.smoothnessIndex).toFixed(1)}s
                  </span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 mt-3">
              {optimizationResult.summary}
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              const name = `${algorithm.toUpperCase()} Balanced (${optimizedMetrics.actualWorkstationsCount} ST)`;
              onSaveAsScenario(name, optimizationResult.stations, optimizationResult.tasks);
              onClose();
            }}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            Save as What-If Scenario
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onApplyOptimization(optimizationResult.stations, optimizationResult.tasks);
                onClose();
              }}
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              Apply Optimization to Line
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

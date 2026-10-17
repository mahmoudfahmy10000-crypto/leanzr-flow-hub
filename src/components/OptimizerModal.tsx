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
import { Modal } from './Modal.tsx';
import { CheckCircle2, TrendingUp } from 'lucide-react';

interface OptimizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  stations: Workstation[];
  params: OperatingParameters;
  currentMetrics: LineCalculations;
  onApplyOptimization: (stations: Workstation[], tasks: Task[]) => boolean | void;
  onSaveAsScenario: (name: string, stations: Workstation[], tasks: Task[]) => boolean | void;
  saveError?: string | null;
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
  saveError,
}) => {
  const [submissionFailed, setSubmissionFailed] = useState(false);
  const [algorithm, setAlgorithm] = useState<'rpw' | 'lpt' | 'leveling'>('rpw');
  const [targetMode, setTargetMode] = useState<'takt' | 'target' | 'custom'>('takt');
  const [customCT, setCustomCT] = useState(
    String(Math.round(currentMetrics.taktTimeSeconds > 0 ? currentMetrics.taktTimeSeconds : 100))
  );

  const getTargetTime = () => {
    if (targetMode === 'takt') return currentMetrics.taktTimeSeconds;
    if (targetMode === 'target') return currentMetrics.targetCycleTimeSeconds;
    return Number(customCT);
  };

  // Run selected optimization deterministically
  const targetTime = getTargetTime();
  const optimizationResult: OptimizationResult | null = React.useMemo(() => {
    if (!isOpen) return null;
    if (algorithm === 'rpw') {
      return runRPWOptimization(tasks, targetTime, stations);
    }
    if (algorithm === 'lpt') {
      return runLPTOptimization(tasks, targetTime, stations);
    }
    return runSmoothnessLeveling(stations, tasks, targetTime);
  }, [isOpen, algorithm, targetTime, tasks, stations]);

  // Compute full metrics for the optimized result
  const optimizedMetrics = React.useMemo(() => {
    if (!optimizationResult) return null;
    return calculateLineMetrics(
      optimizationResult.stations,
      optimizationResult.tasks,
      params
    );
  }, [optimizationResult, params]);

  React.useEffect(() => {
    setSubmissionFailed(false);
  }, [isOpen, optimizationResult]);

  if (!isOpen || !optimizationResult || !optimizedMetrics) return null;

  const canApply = optimizationResult.assessment.status === 'valid' && optimizedMetrics.assessment.status === 'valid';
  const reasons = [...optimizationResult.assessment.reasons, ...optimizedMetrics.assessment.reasons]
    .filter((reason, index, all) => all.findIndex((other) => other.code === reason.code && other.message === reason.message) === index);

  const effDelta = optimizedMetrics.lineBalancingEfficiencyPercent - currentMetrics.lineBalancingEfficiencyPercent;
  const ctDelta = optimizedMetrics.bottleneckCycleTime - currentMetrics.bottleneckCycleTime;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Deterministic Line Balancing Optimizer" className="max-w-3xl">
        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          <div role="status" className={`p-3 rounded-xl border text-xs ${canApply ? 'border-cyan-700 bg-cyan-950/30 text-cyan-200' : 'border-amber-700 bg-amber-950/30 text-amber-200'}`}>
            <p className="font-semibold">Proposal status: {optimizationResult.assessment.status}; project evaluation: {optimizedMetrics.assessment.status}</p>
            {reasons.length > 0 && <ul className="mt-2 list-disc pl-4 space-y-1">{reasons.map((reason, index) => <li key={`${reason.code}-${index}`}>{reason.message}</li>)}</ul>}
            <p className="mt-2">Sequential station loads are used without dividing by operator count. These heuristics do not prove a global optimum or model machine/operator schedules.</p>
            {!canApply && <p className="mt-2">Resolve the listed issues before saving or applying this proposal.</p>}
          </div>
          {submissionFailed && (
            <p role="alert" className="rounded-xl border border-rose-700 bg-rose-950/30 p-3 text-xs text-rose-200">
              {saveError || 'The proposal could not be saved. Review the project validation or storage error and try again.'}
            </p>
          )}
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
                  <span>Workload Leveling</span>
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
                      onChange={(e) => setCustomCT(e.target.value)}
                      aria-label="Custom target cycle time (seconds)"
                      min="0"
                      step="any"
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
              if (!canApply) return;
              const name = `${algorithm.toUpperCase()} Proposal (${optimizedMetrics.actualWorkstationsCount} ST)`;
              const saved = onSaveAsScenario(name, optimizationResult.stations, optimizationResult.tasks);
              setSubmissionFailed(saved === false);
              if (saved !== false) onClose();
            }}
            disabled={!canApply}
            className="disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors cursor-pointer"
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
                if (!canApply) return;
                const applied = onApplyOptimization(optimizationResult.stations, optimizationResult.tasks);
                setSubmissionFailed(applied === false);
                if (applied !== false) onClose();
              }}
              disabled={!canApply}
              className="disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              Apply Optimization to Line
            </button>
          </div>
        </div>
    </Modal>
  );
};
